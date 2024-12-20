"use client";

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Voucher {
  id: string;
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  remaining_quantity: number;
  is_active: boolean;
  expires_at: string;
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newVoucher, setNewVoucher] = useState({
    code: '',
    description: '',
    discount_amount: 0,
    total_quantity: 0,
    expires_at: ''
  });

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      toast.error('Failed to load vouchers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVoucher = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('vouchers')
        .insert({
          ...newVoucher,
          code: newVoucher.code.toUpperCase(),
          remaining_quantity: newVoucher.total_quantity,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setVouchers(prev => [data, ...prev]);
      toast.success('Voucher created successfully');
      setNewVoucher({
        code: '',
        description: '',
        discount_amount: 0,
        total_quantity: 0,
        expires_at: ''
      });
    } catch (error) {
      console.error('Error creating voucher:', error);
      toast.error('Failed to create voucher');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Voucher Management</h1>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Voucher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Voucher</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Voucher Code (6 characters)</Label>
                <Input
                  maxLength={6}
                  value={newVoucher.code}
                  onChange={(e) => setNewVoucher(prev => ({
                    ...prev,
                    code: e.target.value.toUpperCase()
                  }))}
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={newVoucher.description}
                  onChange={(e) => setNewVoucher(prev => ({
                    ...prev,
                    description: e.target.value
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Discount Amount (Rp)</Label>
                <Input
                  type="number"
                  value={newVoucher.discount_amount}
                  onChange={(e) => setNewVoucher(prev => ({
                    ...prev,
                    discount_amount: parseInt(e.target.value)
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={newVoucher.total_quantity}
                  onChange={(e) => setNewVoucher(prev => ({
                    ...prev,
                    total_quantity: parseInt(e.target.value)
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  type="datetime-local"
                  value={newVoucher.expires_at}
                  onChange={(e) => setNewVoucher(prev => ({
                    ...prev,
                    expires_at: e.target.value
                  }))}
                />
              </div>
              <Button
                onClick={handleCreateVoucher}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Create Voucher'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers.map((voucher) => (
              <TableRow key={voucher.id}>
                <TableCell className="font-medium">{voucher.code}</TableCell>
                <TableCell>{voucher.description}</TableCell>
                <TableCell>Rp {voucher.discount_amount.toLocaleString()}</TableCell>
                <TableCell>
                  {voucher.remaining_quantity}/{voucher.total_quantity}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    voucher.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {voucher.is_active ? 'Active' : 'Inactive'}
                  </span>
                </TableCell>
                <TableCell>{format(new Date(voucher.expires_at), 'dd/MM/yyyy HH:mm')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
} 