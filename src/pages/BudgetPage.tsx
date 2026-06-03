import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// 実行予算書アプリを遅延読み込み
const BudgetApp = lazy(() => import('../budget/BudgetEntry'));

export default function BudgetPage() {
  const location = useLocation();
  // ?project= パラメータが変わるたびに再マウント → useEffect が再実行される
  const projectParam = new URLSearchParams(location.search).get('project') ?? '';

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BudgetApp key={projectParam} />
    </Suspense>
  );
}
