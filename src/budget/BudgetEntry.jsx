import App from './App';
import { DialogProvider } from './DialogProvider';
import './index.css';

export default function BudgetEntry({ onNavigateToPhoto, projectAddress }) {
  return (
    <DialogProvider>
      <App onNavigateToPhoto={onNavigateToPhoto} projectAddress={projectAddress} />
    </DialogProvider>
  );
}
