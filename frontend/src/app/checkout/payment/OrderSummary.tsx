'use client';

import React from 'react';
import { ShieldCheck, Truck, Package, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { formatPrice } from '@/lib/currency';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: {
    name: string;
    images?: string[];
  };
}

interface Order {
  id: string;
  totalAmount: number;
  items: OrderItem[];
}

interface Props {
  order: Order | null;
}

export default function OrderSummary({ order }: Props) {
  if (!order) {
    return (
      <div className="bg-card border border-border/50 rounded-3xl p-6 animate-pulse shadow-premium">
        <div className="h-6 w-32 bg-[#30363D] rounded mb-6"></div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-16 h-16 bg-[#30363D] rounded-lg"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-[#30363D] rounded w-3/4"></div>
                <div className="h-4 bg-[#30363D] rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const platformFeePercent = 5;
  const platformFee = order.totalAmount * (platformFeePercent / 100);

  return (
    <div className="space-y-6">
      {/* Items Card */}
      <div className="bg-card border border-border/50 rounded-3xl overflow-hidden shadow-premium">
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Order Summary</h2>
          <span className="text-xs font-medium px-2 py-0.5 bg-muted text-muted-foreground rounded uppercase tracking-wider">
            {order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}
          </span>
        </div>

        <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-4 group">
              <div className="relative w-20 h-20 bg-background rounded-xl overflow-hidden border border-border/50 shrink-0 shadow-sm">
                {item.product.images?.[0] ? (
                  <Image
                    src={item.product.images[0]}
                    alt={item.product.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted/30" />
                  </div>
                )}
              </div>
              <div className="flex-1 py-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug">{item.product.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-white">{formatPrice(item.price)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-muted/30 space-y-4 border-t border-border/50">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-white">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm group">
            <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Platform Protection</span>
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-primary font-medium">{formatPrice(platformFee)}</span>
          </div>
          <div className="pt-4 border-t border-border/50 flex justify-between">
            <span className="text-lg font-bold text-white">Total</span>
            <span className="text-2xl font-black text-white">{formatPrice(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Escrow Timeline */}
      <div className="bg-primary/5 border border-primary/10 rounded-3xl p-6 shadow-premium">
        <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            How Escrow Works
        </h3>
        <div className="space-y-6">
            <div className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">1</div>
                <div>
                    <p className="text-sm font-bold text-white">Secure Checkout</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Pay securely using our encrypted gateway. Funds are held in a secure escrow account.</p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[#30363D] flex items-center justify-center text-muted-foreground font-bold text-sm">2</div>
                <div>
                    <p className="text-sm font-bold text-white">Supplier Ships</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">The supplier is notified to ship your goods. You can track the delivery details.</p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[#30363D] flex items-center justify-center text-muted-foreground font-bold text-sm">3</div>
                <div>
                    <p className="text-sm font-bold text-white">Confirm Delivery</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Once you receive the goods and are satisfied, you confirm delivery on the platform.</p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[#30363D] flex items-center justify-center text-muted-foreground font-bold text-sm">4</div>
                <div>
                    <p className="text-sm font-bold text-white">Supplier Paid</p>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">The funds are released to the supplier's bank account automatically.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
