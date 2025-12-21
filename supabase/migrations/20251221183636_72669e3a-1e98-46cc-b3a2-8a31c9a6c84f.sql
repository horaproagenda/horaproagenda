-- Enable REPLICA IDENTITY FULL for complete row data in realtime updates
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.clients REPLICA IDENTITY FULL;
ALTER TABLE public.services REPLICA IDENTITY FULL;
ALTER TABLE public.service_packages REPLICA IDENTITY FULL;
ALTER TABLE public.single_sales REPLICA IDENTITY FULL;
ALTER TABLE public.financial_entries REPLICA IDENTITY FULL;
ALTER TABLE public.cash_registers REPLICA IDENTITY FULL;
ALTER TABLE public.cash_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.professionals REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication for real-time synchronization
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.package_appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.single_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_registers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.professionals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_absences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods;
ALTER PUBLICATION supabase_realtime ADD TABLE public.banks;