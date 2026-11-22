import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyAccent } from './card';
import App from './App';

applyAccent();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
