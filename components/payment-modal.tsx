"use client";

import { useEffect, useRef, useState } from 'react';

interface PaymentModalProps {
  token: string;
  onSuccess: (result: any) => void;
  onPending: (result: any) => void;
  onError: (result: any) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    snap?: any;
  }
}

export function PaymentModal({
  token,
  onSuccess,
  onPending,
  onError,
  onClose
}: PaymentModalProps) {
  const snapInitialized = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadScript = async () => {
      try {
        if (!window.snap && !document.getElementById('midtrans-script')) {
          const script = document.createElement('script');
          script.id = 'midtrans-script';
          script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
          script.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '');
          
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        if (token && !snapInitialized.current) {
          snapInitialized.current = true;
          
          const midtransCallback = {
            onSuccess: async (result: any) => {
              console.log('Midtrans Success:', result);
              
              // Format the result
              const formattedResult = {
                ...result,
                transaction_status: 'settlement',
                status_code: '200',
                status_message: 'Success, transaction is found',
                transaction_id: result.transaction_id || result.order_id
              };

              console.log('Formatted result:', formattedResult);
              
              try {
                await onSuccess(formattedResult);
              } catch (error) {
                console.error('Error in success callback:', error);
              }
            },
            onPending: (result: any) => {
              console.log('Midtrans Pending:', result);
              onPending(result);
            },
            onError: (result: any) => {
              console.error('Midtrans Error:', result);
              onError(result);
            },
            onClose: () => {
              console.log('Midtrans widget closed');
              snapInitialized.current = false;
              onClose();
            }
          };

          // @ts-ignore
          window.snap.pay(token, midtransCallback);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading Midtrans script:', error);
        setIsLoading(false);
      }
    };

    loadScript();

    return () => {
      snapInitialized.current = false;
      const script = document.getElementById('midtrans-script');
      if (script) {
        document.head.removeChild(script);
      }
    };
  }, [token, onSuccess, onPending, onError, onClose]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white p-4 rounded-lg">
          Loading payment...
        </div>
      </div>
    );
  }

  return null;
} 