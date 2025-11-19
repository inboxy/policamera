# 📸 PoliCamera v2.1

> **Professional PWA Camera with AI Detection, GPS Tracking, OCR, Barcode Scanning, and Depth Estimation**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-80%2B-green)](https://jestjs.io/)
[![Coverage](https://img.shields.io/badge/Coverage-85%25-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🌟 Features

### Core Functionality
- 📷 **Professional Camera** - High-quality photo capture with real-time preview
- 🗺️ **GPS Tracking** - Real-time location logging with device orientation
- 🔐 **AES-256 Encryption** - Secure GPS data storage
- 📶 **Network Monitoring** - Connection quality indicators
- 💾 **Offline Support** - Progressive Web App with Service Worker

### AI & Machine Learning
- 🎯 **Object Detection** - TensorFlow.js + MobileNet V2 (30 FPS)
- 👤 **Face Detection** - BlazeFace model (30 FPS)
- 🕺 **Pose Estimation** - MoveNet multi-person detection (30 FPS)
- 🌊 **Depth Prediction** - Depth-Anything V2 monocular depth (10 FPS)
- 🔤 **OCR Recognition** - Tesseract.js text recognition with subtitle display
- 📱 **Barcode Scanner** - **NEW!** ZXing multi-format barcode/QR code detection

### Advanced Features
- 🧩 **Image Stitching** - Panoramic photo creation
- 📊 **Multi-Format Barcodes** - 1D/2D codes (EAN, UPC, Code128, QR, Data Matrix, PDF417, Aztec)
- 🎨 **Real-time Overlays** - Detection visualization on video feed
- 📈 **Performance Metrics** - FPS counters and statistics
- 🌐 **Multi-language OCR** - 100+ languages supported

---

## 🆕 What's New in v2.1

### Barcode/QR Code Scanner 📱
- **Multi-format detection** using ZXing library
- **1D barcodes**: EAN-13, EAN-8, UPC-A, UPC-E, Code 39, Code 93, Code 128, ITF, Codabar
- **2D codes**: QR Code, Data Matrix, Aztec, PDF417, MaxiCode
- **Subtitle-style display bar** for scanned codes
- **Format icons** and visual feedback
- **Result history** tracking (last 20 scans)
- **Performance optimized** at 5 FPS
- **XSS protection** for barcode data

---

## 🆕 What's New in v2.0

### TypeScript Migration ✨
- **Full TypeScript support** with strict type checking
- **Type definitions** for all modules
- **Better IDE support** with autocomplete and IntelliSense
- **Compile-time error detection**

### OCR Feature 🔤
- **Real-time text recognition** using Tesseract.js
- **Subtitle-style display bar** for recognized text
- **Confidence indicators** (●/◐/○)
- **Multi-language support** (English, French, Spanish, Chinese, etc.)
- **Auto-fade display** after 5 seconds
- **Performance optimized** at 1 FPS

### Testing Infrastructure 🧪
- **45+ unit tests** with Jest + ts-jest
- **>85% code coverage** for critical modules
- **Mocked browser APIs** for reliable testing
- **CI-ready** test suite

### Enhanced Security 🔒
- **GPS encryption** with Web Crypto API
- **Service Worker integrity** checks
- **XSS protection** for OCR text
- **Cache validation** and size limits

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/inboxy/policamera.git
cd policamera

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start development server
npm run dev
```

Visit `http://localhost:8000`

---

## 🔤 OCR Feature

### Quick Start
```javascript
// Initialize OCR
await window.ocrManager.initialize();

// Enable OCR
await window.ocrManager.toggle();

// OCR will now run automatically at 1 FPS
// Recognized text appears in subtitle bar at bottom
```

### Configuration
```javascript
const ocr = new OCRManager(
  {
    language: 'eng',      // English
    targetFPS: 1,         // 1 frame per second
    minConfidence: 60,    // 60% minimum confidence
  },
  {
    position: 'bottom',   // Subtitle position
    fontSize: 18,         // Text size
    fadeTime: 5000,       // Auto-hide after 5s
  }
);
```

See **[TYPESCRIPT_MIGRATION.md](TYPESCRIPT_MIGRATION.md)** for full OCR documentation.

---

## 📱 Barcode Scanner Feature

### Quick Start
```javascript
// Initialize barcode scanner
await window.barcodeManager.initialize();

// Enable barcode scanner
await window.barcodeManager.toggle();

// Scan from image
const img = document.querySelector('img');
const result = await window.barcodeManager.scanFromImage(img);

// Scan from video continuously
const video = document.querySelector('video');
await window.barcodeManager.scanFromVideo(video, (result) => {
  console.log(`Scanned ${result.format}: ${result.text}`);
});
```

### Configuration
```javascript
const barcodeScanner = new BarcodeManager(
  {
    targetFPS: 5,         // 5 scans per second
    tryHarder: true,      // More accurate scanning
    formats: [            // Specific formats (optional)
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.CODE_128
    ]
  },
  {
    position: 'bottom',   // Subtitle position
    fontSize: 18,         // Text size
    fadeTime: 5000,       // Auto-hide after 5s
  }
);
```

### Supported Formats

**1D Barcodes:**
- EAN-13, EAN-8 (European/International Article Number)
- UPC-A, UPC-E (Universal Product Code)
- Code 39, Code 93, Code 128
- ITF (Interleaved 2 of 5)
- Codabar

**2D Codes:**
- QR Code
- Data Matrix
- Aztec Code
- PDF417
- MaxiCode

### API Methods
```javascript
// Initialize scanner
await barcodeManager.initialize();

// Toggle on/off
const isEnabled = await barcodeManager.toggle();

// Scan from image
const result = await barcodeManager.scanFromImage(imageElement);

// Scan from video with callback
await barcodeManager.scanFromVideo(videoElement, callback);

// Stop continuous scanning
barcodeManager.stopScanning();

// Get scan history (last 20 scans)
const history = barcodeManager.getHistory();

// Get current result
const current = barcodeManager.getCurrentResult();

// Get performance metrics
const metrics = barcodeManager.getMetrics();

// Get supported formats
const formats = barcodeManager.getSupportedFormats();

// Clear history
barcodeManager.clearHistory();

// Cleanup
await barcodeManager.cleanup();
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Suites**: 3 (State Manager, OCR Manager, Barcode Manager)
**Total Tests**: 80+
**Coverage**: >85%

---

## 📖 Documentation

- **[TypeScript Migration Guide](TYPESCRIPT_MIGRATION.md)** - TypeScript setup and OCR feature
- **[Code Improvements](IMPROVEMENTS.md)** - Phase 1 enhancements
- **[Phase 2 Refactoring](REFACTORING_PHASE2.md)** - Advanced architecture

---

## 📦 Technologies

- **TypeScript 5.3** - Type-safe JavaScript
- **TensorFlow.js 4.20** - Object/face/pose detection
- **Transformers.js 3.0** - Depth prediction
- **Tesseract.js 5.1** - OCR text recognition
- **ZXing 0.20** - Multi-format barcode/QR code scanning
- **Jest 29** - Testing framework
- **IndexedDB** - Local storage with encryption

---

## 📝 License

MIT License

---

**Made with ❤️ for professional documentation and evidence capture**

*PoliCamera v2.1 - Now with TypeScript, OCR, and Barcode Scanning!*