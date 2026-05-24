declare module 'react-native-razorpay' {
  interface RazorpayOptions {
    key: string;
    amount: number;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    theme?: { color?: string };
    modal?: { backdropclose?: boolean; escape?: boolean };
    [key: string]: any;
  }

  interface RazorpayCheckoutStatic {
    open(options: RazorpayOptions): Promise<{
      razorpay_payment_id: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    }>;
  }

  const RazorpayCheckout: RazorpayCheckoutStatic;
  export default RazorpayCheckout;
}

declare module 'expo-document-picker' {
  export interface DocumentPickerOptions {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }

  export interface DocumentPickerAsset {
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
  }

  export interface DocumentPickerResult {
    canceled: boolean;
    assets: DocumentPickerAsset[] | null;
  }

  export function getDocumentAsync(options?: DocumentPickerOptions): Promise<DocumentPickerResult>;
}
