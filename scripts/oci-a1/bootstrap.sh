#!/usr/bin/env bash
# Prepare oci-a1 (Ubuntu 24.04 arm64) to receive JetScope.
#
# Run this from the MacBook. It drives oci-a1 over SSH and is idempotent:
# every step prints "ok" and skips when already satisfied.
#
# Usage:
#   bash scripts/oci-a1/bootstrap.sh             # preflight + apply
#   bash scripts/oci-a1/bootstrap.sh --dry-run   # print the plan; no SSH, no network
#   bash scripts/oci-a1/bootstrap.sh --help
#
# What it does:
#   1. read-only preflight: tailscale serve/funnel must be unconfigured
#      (RFC SEC-02), / has >= 5 GiB free, docker compose works, sudo is
#      passwordless without a prompt;
#   2. create /opt/jetscope and /opt/jetscope/data (ubuntu:ubuntu 750);
#   3. install Node from the official linux-arm64 tarball into /opt/node-22,
#      after GPG-verifying SHASUMS256.txt with the keys published in
#      github.com/nodejs/release-keys and then checking the tarball sha256.
#      The system apt node is not touched and no global PATH is written;
#   4. install sqlite3 when missing;
#   5. print a summary (node version, directory modes, serve/funnel state).
#
# Environment:
#   JETSCOPE_OCI_HOST  SSH host for oci-a1       (default: oci-a1-ts)
#   JETSCOPE_OCI_IP    oci-a1 tailnet IP         (default: 100.81.227.79)
#   JETSCOPE_USA_HOST  usa-vps SSH host, standby (default: usa-vps)
#   NODE_VERSION       Node version to install   (default: v22.23.4)
#
# --dry-run never opens an SSH connection. The preflight is read-only but can
# only run on the target, so dry-run prints it as a planned step instead.
set -Eeuo pipefail

OCI="${JETSCOPE_OCI_HOST:-oci-a1-ts}"
OCI_IP="${JETSCOPE_OCI_IP:-100.81.227.79}"
USA="${JETSCOPE_USA_HOST:-usa-vps}"
NODE_VERSION="${NODE_VERSION:-v22.23.4}"
# Signer of the $NODE_VERSION SHASUMS256.txt.sig: only these primary key
# fingerprints (space-separated list) may validate the manifest. Update it when
# NODE_VERSION changes; the fingerprint for a release is the primary key in the
# gpg status VALIDSIG line. The list is validated item by item locally, then
# passed to the remote side comma-separated because ssh rejoins argv into one
# string and would otherwise split only the first fingerprint into $2.
NODE_SIGNER_FPRS="${NODE_SIGNER_FPRS:-5BE8A3F6C8A5C01D106C0AD820B1A390B168D356}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      awk 'NR==1 {next} /^set -Eeuo pipefail$/ {exit} {print}' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# Validate on the local side before either value reaches an ssh command line:
# NODE_VERSION and NODE_SIGNER_FPRS are interpolated into remote shell text.
if [[ ! "$NODE_VERSION" =~ ^v22\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: NODE_VERSION='$NODE_VERSION' does not match ^v22\\.[0-9]+\\.[0-9]+\$" >&2
  exit 1
fi
read -r -a NODE_SIGNER_FPR_LIST <<< "$NODE_SIGNER_FPRS"
(( ${#NODE_SIGNER_FPR_LIST[@]} > 0 )) \
  || { echo "ERROR: NODE_SIGNER_FPRS is empty" >&2; exit 1; }
for fpr in "${NODE_SIGNER_FPR_LIST[@]}"; do
  [[ "$fpr" =~ ^[A-F0-9]{40}$ ]] \
    || { echo "ERROR: NODE_SIGNER_FPRS contains an invalid fingerprint: '$fpr'" >&2; exit 1; }
done
# ssh joins argv back into a single string, so a space-separated list would
# reach the remote script as several arguments. Pass one comma-separated word.
NODE_SIGNER_FPRS_REMOTE=""
for fpr in "${NODE_SIGNER_FPR_LIST[@]}"; do
  NODE_SIGNER_FPRS_REMOTE="${NODE_SIGNER_FPRS_REMOTE:+$NODE_SIGNER_FPRS_REMOTE,}$fpr"
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> DRY-RUN: no SSH, no network, no remote changes"
  echo "host=$OCI ip=$OCI_IP standby=$USA node_version=$NODE_VERSION"
  echo "node signer fingerprints (NODE_SIGNER_FPRS): $NODE_SIGNER_FPRS"
  echo "would: ssh -o BatchMode=yes $OCI bash -s -- $NODE_VERSION $NODE_SIGNER_FPRS_REMOTE"
  echo "would: cd / (ubuntu home is 750)"
  echo "would: preflight (read-only, abort on any failure):"
  echo "would:   sudo -n true"
  echo "would:   sudo -n tailscale serve status  -> exit 0 and contains 'No serve config'"
  echo "would:   sudo -n tailscale funnel status -> exit 0 and contains 'No serve config'"
  echo "would:   df -Pk / -> available KiB >= $((5 * 1024 * 1024)) (5 GiB)"
  echo "would:   docker info (proves the daemon socket is reachable)"
  echo "would: ensure /opt/jetscope and /opt/jetscope/data are ubuntu:ubuntu 750"
  echo "would: if /opt/node-22/bin/node --version != $NODE_VERSION:"
  echo "would:   download https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-arm64.tar.xz"
  echo "would:   download https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
  echo "would:   download https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt.sig"
  echo "would:   download https://raw.githubusercontent.com/nodejs/release-keys/main/keys.list"
  echo "would:   import each https://raw.githubusercontent.com/nodejs/release-keys/main/keys/<fingerprint>.asc"
  echo "would:   into a temporary GNUPGHOME, then gpg --batch --status-fd 1 --verify SHASUMS256.txt.sig SHASUMS256.txt"
  echo "would:   read the primary key fingerprint (last field of the [GNUPG:] VALIDSIG line)"
  echo "would:   abort unless that fingerprint is one of: $NODE_SIGNER_FPRS"
  echo "would:   grep ' node-$NODE_VERSION-linux-arm64.tar.xz\$' SHASUMS256.txt | sha256sum -c -"
  echo "would:   extract to /opt/node-22.new, keep the old tree as /opt/node-22.prev, then rename"
  echo "would:   assert /opt/node-22/bin/node --version == $NODE_VERSION"
  echo "would: else print ok: node $NODE_VERSION already installed"
  echo "would: if sqlite3 is missing: sudo apt-get install -y sqlite3 (retry after apt-get update on failure)"
  echo "would: else print ok: sqlite3 already installed"
  echo "would: print summary: node version, /opt/jetscope modes, serve/funnel status"
  exit 0
fi

echo "==> connecting to $OCI (tailnet $OCI_IP); standby $USA is not touched"
ssh -o BatchMode=yes -o ConnectTimeout=12 "$OCI" bash -s -- "$NODE_VERSION" "$NODE_SIGNER_FPRS_REMOTE" <<'REMOTE'
set -Eeuo pipefail

NODE_VERSION="${1:-v22.23.4}"
NODE_SIGNER_FPRS="${2:-5BE8A3F6C8A5C01D106C0AD820B1A390B168D356}"
IFS=, read -r -a NODE_SIGNER_FPR_LIST <<< "$NODE_SIGNER_FPRS"
PREFIX=/opt/node-22
RELEASE_KEYS_URL="https://raw.githubusercontent.com/nodejs/release-keys/main"

cd /

abort() {
  echo "ABORT: $*" >&2
  exit 1
}

echo "==> preflight (read-only)"
sudo -n true 2>/dev/null || abort "passwordless sudo is not available for $(id -un)"
echo "ok: passwordless sudo"

for kind in serve funnel; do
  if ! out="$(sudo -n tailscale "$kind" status 2>&1)"; then
    printf '%s\n' "$out" >&2
    abort "tailscale $kind status failed; RFC SEC-02 preflight cannot be verified"
  fi
  if [[ "$out" != *"No serve config"* ]]; then
    printf '%s\n' "$out" >&2
    abort "tailscale $kind is configured on this host; RFC SEC-02 requires it to stay unconfigured"
  fi
  echo "ok: tailscale $kind has no serve config"
done

avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
[[ "$avail_kb" =~ ^[0-9]+$ ]] || abort "could not read free space for / (df said: '$avail_kb')"
if (( avail_kb < 5 * 1024 * 1024 )); then
  abort "/ has ${avail_kb} KiB free; need at least 5242880 KiB (5 GiB)"
fi
echo "ok: / has ${avail_kb} KiB free (>= 5 GiB)"

docker info >/dev/null 2>&1 \
  || abort "docker daemon is not reachable for user $(id -un); is the user in the docker group?"
echo "ok: docker daemon reachable"

echo "==> directories"
for dir in /opt/jetscope /opt/jetscope/data; do
  want="ubuntu:ubuntu 750"
  if [[ -d "$dir" && "$(stat -c '%U:%G %a' "$dir")" == "$want" ]]; then
    echo "ok: $dir is $want"
    continue
  fi
  sudo mkdir -p "$dir"
  sudo chown ubuntu:ubuntu "$dir"
  sudo chmod 750 "$dir"
  got="$(stat -c '%U:%G %a' "$dir")"
  [[ "$got" == "$want" ]] || abort "$dir is '$got', expected '$want'"
  echo "ok: $dir created as $want"
done

echo "==> node $NODE_VERSION"
installed=""
if [[ -x "$PREFIX/bin/node" ]]; then
  installed="$("$PREFIX/bin/node" --version 2>/dev/null || true)"
fi
if [[ "$installed" == "$NODE_VERSION" ]]; then
  echo "ok: node $installed already installed at $PREFIX"
else
  work="$(mktemp -d)"
  GNUPGHOME="$(mktemp -d)"
  export GNUPGHOME
  chmod 700 "$GNUPGHOME"
  cleanup() {
    gpgconf --kill all >/dev/null 2>&1 || true
    sudo rm -rf "$PREFIX.new" >/dev/null 2>&1 || true
    rm -rf "$work" "$GNUPGHOME"
  }
  trap cleanup EXIT

  tarball="node-$NODE_VERSION-linux-arm64.tar.xz"
  base="https://nodejs.org/dist/$NODE_VERSION"

  echo " -> downloading $tarball and signatures"
  curl -fsSL --retry 3 -o "$work/$tarball" "$base/$tarball" \
    || abort "download failed: $base/$tarball"
  curl -fsSL --retry 3 -o "$work/SHASUMS256.txt" "$base/SHASUMS256.txt" \
    || abort "download failed: $base/SHASUMS256.txt"
  curl -fsSL --retry 3 -o "$work/SHASUMS256.txt.sig" "$base/SHASUMS256.txt.sig" \
    || abort "download failed: $base/SHASUMS256.txt.sig"

  echo " -> importing Node release keys into a temporary GNUPGHOME"
  curl -fsSL --retry 3 -o "$work/keys.list" "$RELEASE_KEYS_URL/keys.list" \
    || abort "download failed: $RELEASE_KEYS_URL/keys.list"
  key_count=0
  while IFS= read -r fingerprint; do
    fingerprint="${fingerprint%$'\r'}"
    [[ -z "$fingerprint" ]] && continue
    [[ "$fingerprint" == \#* ]] && continue
    [[ "$fingerprint" =~ ^[A-F0-9]{40}$ ]] \
      || abort "keys.list contained an invalid key fingerprint: '$fingerprint'"
    curl -fsSL --retry 3 -o "$work/$fingerprint.asc" "$RELEASE_KEYS_URL/keys/$fingerprint.asc" \
      || abort "could not download release key $fingerprint"
    gpg --batch --quiet --import "$work/$fingerprint.asc" 2>/dev/null \
      || abort "could not import release key $fingerprint"
    key_count=$((key_count + 1))
  done < "$work/keys.list"
  (( key_count > 0 )) || abort "keys.list produced no keys"
  echo "ok: imported $key_count release keys"

  echo " -> gpg --batch --status-fd 1 --verify SHASUMS256.txt.sig SHASUMS256.txt"
  verify_status="$(gpg --batch --status-fd 1 \
    --verify "$work/SHASUMS256.txt.sig" "$work/SHASUMS256.txt" 2>"$work/gpg-verify.log")" \
    || abort "GPG signature verification failed (SEC-04)"
  signer_fpr="$(printf '%s\n' "$verify_status" \
    | awk '/^\[GNUPG:\] VALIDSIG / { fpr = $NF } END { print fpr }')"
  [[ -n "$signer_fpr" ]] \
    || abort "gpg did not report a VALIDSIG primary key fingerprint; refusing to trust the manifest"
  signer_allowed=0
  for allowed_fpr in "${NODE_SIGNER_FPR_LIST[@]}"; do
    if [[ "$signer_fpr" == "$allowed_fpr" ]]; then
      signer_allowed=1
      break
    fi
  done
  (( signer_allowed )) \
    || abort "SHASUMS256.txt.sig signed by $signer_fpr, which is not an allowed Node signer (NODE_SIGNER_FPRS=$NODE_SIGNER_FPRS)"
  echo "ok: SHASUMS256.txt signature verified (signer $signer_fpr)"

  echo " -> sha256sum -c"
  ( cd "$work" && grep -- " node-$NODE_VERSION-linux-arm64.tar.xz\$" SHASUMS256.txt | sha256sum -c - ) \
    || abort "sha256 verification failed for $tarball"
  echo "ok: $tarball sha256 matches SHASUMS256.txt"

  echo " -> extracting to $PREFIX"
  sudo rm -rf "$PREFIX.new"
  sudo mkdir -p "$PREFIX.new"
  sudo tar -xJf "$work/$tarball" -C "$PREFIX.new" --strip-components=1 --no-same-owner \
    || abort "could not extract $tarball"
  sudo chown -R root:root "$PREFIX.new" \
    || abort "could not make $PREFIX.new root-owned"
  staged="$("$PREFIX.new/bin/node" --version 2>/dev/null || true)"
  [[ "$staged" == "$NODE_VERSION" ]] \
    || abort "$PREFIX.new/bin/node reports '$staged', expected $NODE_VERSION"
  if [[ -e "$PREFIX" ]]; then
    sudo rm -rf "$PREFIX.prev"
    sudo mv "$PREFIX" "$PREFIX.prev"
    echo "ok: previous tree kept at $PREFIX.prev"
  fi
  sudo mv "$PREFIX.new" "$PREFIX"
  echo "ok: node installed at $PREFIX"
fi
[[ "$("$PREFIX/bin/node" --version)" == "$NODE_VERSION" ]] \
  || abort "$PREFIX/bin/node is not $NODE_VERSION"

echo "==> sqlite3"
if command -v sqlite3 >/dev/null 2>&1; then
  echo "ok: sqlite3 $(sqlite3 --version | awk '{print $1}') already installed"
else
  # </dev/null keeps apt-get from consuming the rest of this `bash -s` script.
  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 </dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update </dev/null \
      || abort "apt-get update failed"
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 </dev/null \
      || abort "apt-get install sqlite3 failed"
  fi
  command -v sqlite3 >/dev/null 2>&1 || abort "sqlite3 still missing after install"
  echo "ok: sqlite3 $(sqlite3 --version | awk '{print $1}') installed"
fi

echo "==> summary"
echo "node: $("$PREFIX/bin/node" --version) ($PREFIX/bin/node)"
for dir in /opt/jetscope /opt/jetscope/data; do
  echo "$dir: $(stat -c '%U:%G %a' "$dir")"
done
echo "tailscale serve: $(sudo tailscale serve status 2>&1 | tr '\n' ' ' || true)"
echo "tailscale funnel: $(sudo tailscale funnel status 2>&1 | tr '\n' ' ' || true)"
REMOTE
