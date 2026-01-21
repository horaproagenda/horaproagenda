import { useCashRegisters } from './useCashRegisters';

/**
 * Hook to check if cash register is open and get related status
 * Used to block financial transactions when cash register is closed
 */
export function useCashRegisterStatus() {
  const { currentOpenRegister, cashRegisters, isLoading } = useCashRegisters();
  
  const isCashRegisterOpen = !!currentOpenRegister;
  
  return {
    isCashRegisterOpen,
    currentOpenRegister,
    cashRegisters,
    isLoading,
  };
}
