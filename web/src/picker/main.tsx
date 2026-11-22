import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { applyAccent } from '../card';
import Picker from './Picker';

applyAccent();
createRoot(document.getElementById('root')!).render(<StrictMode><Picker /></StrictMode>);
