import App from './App';
import { DialogProvider } from './DialogProvider';
import './index.css';

export default function BudgetEntry({ onNavigateToPhoto }) {
  return (
    <DialogProvider>
      <App onNavigateToPhoto={onNavigateToPhoto} />
    </DialogProvider>
  );
}
