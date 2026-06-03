import { createContext, useContext } from 'react';

export const DialogContext = createContext(null);

export function useAppDialog() {
  return useContext(DialogContext);
}
