import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress "MeshBVH: 'maxLeafTris' option has been deprecated" warning
// This comes from the interaction between three-bvh-csg and three-mesh-bvh
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('maxLeafTris')) return;
  originalWarn(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);