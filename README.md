# 📸 PoliCamera v2.0

> **Professional PWA Camera with AI Detection, GPS Tracking, OCR, and Depth Estimation**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-45%2B-green)](https://jestjs.io/)
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
- 🔤 **OCR Recognition** - **NEW!** Tesseract.js text recognition with subtitle display

### Advanced Features
- 🧩 **Image Stitching** - Panoramic photo creation
- 📱 **QR Code Scanning** - Built-in QR reader
- 🎨 **Real-time Overlays** - Detection visualization on video feed
- 📊 **Performance Metrics** - FPS counters and statistics
- 🌐 **Multi-language OCR** - 100+ languages supported

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

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Suites**: 2 (State Manager, OCR Manager)
**Total Tests**: 45+
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
- **Jest 29** - Testing framework
- **IndexedDB** - Local storage with encryption

---

## 📝 License

MIT License

---

**Made with ❤️ for professional documentation and evidence capture**

*PoliCamera v2.0 - Now with TypeScript and OCR!*