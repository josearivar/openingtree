/**
 * Stockfish Web Worker Wrapper
 * This file loads Stockfish WASM and handles UCI communication
 * 
 * stockfish.js from nmrugg/stockfish.js is designed to work as a web worker directly
 * We just need to import it and forward messages
 */

// Import the stockfish engine - it will initialize itself
importScripts('./stockfish.js');

// The stockfish.js script sets up its own message handling
// We just need to signal that we're ready after a short delay
// to ensure the engine has initialized

let isReady = false;

// Override the default message handler to add our ready signal
const originalOnMessage = self.onmessage;

self.onmessage = function(e) {
  // Forward to the stockfish handler
  if (originalOnMessage) {
    originalOnMessage(e);
  }
};

// Send ready signal after engine initializes
setTimeout(function() {
  postMessage('stockfish-ready');
}, 100);
