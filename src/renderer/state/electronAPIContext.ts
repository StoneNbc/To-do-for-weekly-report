import { createContext } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';

export const ElectronAPIContext = createContext<ElectronAPI | null>(null);
