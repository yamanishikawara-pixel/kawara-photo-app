import { Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const BudgetApp = lazy(() => import('../budget/BudgetEntry'));

export default function BudgetPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const projectParam = params.get('project') ?? '';
  const addressParam = params.get('address') ?? '';

  // 写真台帳への遷移コールバック（budget 側から呼ばれる）
  const goToPhotoApp = (search?: string) => {
    if (search) {
      navigate(`/?search=${encodeURIComponent(search)}`);
    } else {
      navigate('/');
    }
  };

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BudgetApp
        key={projectParam}
        onNavigateToPhoto={goToPhotoApp}
        projectAddress={addressParam}
      />
    </Suspense>
  );
}
