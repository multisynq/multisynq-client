#!/bin/bash

# Exit on any error
set -e

echo "Building documentation with JSDoc..."
npx jsdoc -c jsdoc.json

echo "Extracting version from package.json..."
VERSION=$(node -p "require('./package.json').version")
echo "Package version: $VERSION"

echo "Replacing @CLIENT_VERSION@ placeholders in HTML files..."
find _site/ -name "*.html" -type f -exec sed -i.bak "s/@CLIENT_VERSION@/$VERSION/g" {} +

echo "Cleaning up backup files..."
find _site/ -name "*.html.bak" -type f -delete

echo "Documentation build complete! Version $VERSION has been applied to all HTML files in _site/"
