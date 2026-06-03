import { Suspense, lazy } from 'react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// 実行予算書アプリを遅延読み込み
const BudgetApp = lazy(() => import('../budget/BudgetEntry'));

export default function BudgetPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BudgetApp />
    </Suspense>
  );
}
