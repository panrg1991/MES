import { AppRouter } from './router';

/**
 * 应用根组件
 * 注入路由系统，所有 Provider 在 main.tsx 中统一挂载
 */
function App() {
  return <AppRouter />;
}

export default App;
