# Build script

Example Usage

## Build both architectures for production

```bash
./build-macOS-dmg.sh --environment production
```

## Build only Intel for testing

```bash
./build-macOS-dmg.sh --environment develop --arch x64
```

## Build only Apple Silicon

```bash
./build-macOS-dmg.sh --environment staging --arch arm64
```
