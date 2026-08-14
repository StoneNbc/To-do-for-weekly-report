import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './AppRouter';
import './styles/globals.css';

// StrictMode 仅在开发期帮助发现不安全副作用；数据请求已具备退订/过期响应保护。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
