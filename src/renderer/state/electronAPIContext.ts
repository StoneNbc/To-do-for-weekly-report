import { createContext } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';

// 默认 null 让遗漏 Provider 成为明确错误，而不是悄悄启用开发 Mock。
export const ElectronAPIContext = createContext<ElectronAPI | null>(null);
