import App from './App';
import { DialogProvider } from './DialogProvider';
import './index.css';

export default function BudgetEntry() {
  return (
    <DialogProvider>
      <App />
    </DialogProvider>
  );
}
