#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENT_DIR=$(dirname "$SCRIPT_DIR")
OUTPUT_DIR="$AGENT_DIR/native/.build"
mkdir -p "$OUTPUT_DIR"
SDK_PATH=${SCANNER_SDK_PATH:-$(xcrun --show-sdk-path)}
if [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk ]; then
  SDK_PATH=${SCANNER_SDK_PATH:-/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk}
fi
MODULE_CACHE=${TMPDIR:-/tmp}/printerhub-swift-module-cache
xcrun swiftc -sdk "$SDK_PATH" -module-cache-path "$MODULE_CACHE" "$AGENT_DIR/native/ScannerHelper.swift" -framework ImageCaptureCore -framework UniformTypeIdentifiers -o "$OUTPUT_DIR/printerhub-scan"
echo "Scanner helper built: $OUTPUT_DIR/printerhub-scan"
