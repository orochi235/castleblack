#!/bin/sh
# Build bakery and publish it to PyPI as `pezlie`, at the version in
# bakery/pyproject.toml.
#
#   scripts/publish-bakery.sh
#
# The token lives in the macOS keychain, never in the repo. To store or
# replace it:
#   security add-generic-password -U -s https://upload.pypi.org/legacy/ -a __token__ -w
set -eu

cd "$(dirname "$0")/.."
token=$(security find-generic-password -s https://upload.pypi.org/legacy/ -a __token__ -w) || {
  echo "no PyPI token in the keychain; see the comment at the top of this script" >&2
  exit 1
}
version=$(sed -n 's/^version = "\(.*\)"/\1/p' bakery/pyproject.toml)
dist=$(mktemp -d)
trap 'rm -rf "$dist"' EXIT

echo "building pezlie $version"
uv build bakery --out-dir "$dist"
echo "publishing pezlie $version to PyPI"
UV_PUBLISH_TOKEN=$token uv publish "$dist"/*
