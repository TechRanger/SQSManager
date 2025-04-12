import { Link } from 'react-router-dom';
import FluentButton from '../components/ui/FluentButton';

function NotFoundPage() {
  return (
    <div className="min-h-[calc(100vh-150px)] flex flex-col items-center justify-center text-center p-fluent-3xl">
      <h1 className="text-4xl font-semibold text-neutral-foreground mb-fluent-md">404 - 页面未找到</h1>
      <p className="text-lg text-neutral-secondary mb-fluent-xl">
        抱歉，您访问的页面不存在。
      </p>
      <Link to="/">
        <FluentButton variant="primary">返回仪表盘</FluentButton>
      </Link>
    </div>
  );
}

export default NotFoundPage; 