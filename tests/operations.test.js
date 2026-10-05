import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapsRoute,payrollEstimate,financeSummary} from '../operations.js';

test('sales, external channels and supplier cash movements have no double count',()=>{
  const orders=[{id:'a',source_channel:'counter'},{id:'b',source_channel:'pedidosya'}];
  const movements=[{kind:'income',amount:10000,order_id:'a',method:'cash'},{kind:'income',amount:12000,order_id:'b',method:'card'},{kind:'income',amount:1000},{kind:'expense',amount:-2000},{kind:'expense',amount:-3000,supplier_payment_id:'a'}];
  const suppliers=[{status:'paid',amount:3000},{status:'pending',amount:4000}];
  const result=financeSummary(orders,movements,suppliers);
  assert.equal(result.sales,22000);assert.equal(result.channels.pedidosya.total,12000);
  assert.equal(result.supplierExpense,3000);assert.equal(result.movementIncome,1000);assert.equal(result.net,18000);
});

test('route encodes the destination and payroll subtracts unpaid pauses',()=>{
  const route=new URL(mapsRoute('El Nath 972, Villa Alemana','Ramé Sushi'));
  assert.equal(route.searchParams.get('destination'),'El Nath 972, Villa Alemana');
  assert.equal(route.searchParams.get('travelmode'),'driving');
  assert.equal(payrollEstimate({clock_in:'2026-10-05T12:00:00Z',clock_out:'2026-10-05T20:00:00Z',unpaid_break_minutes:60,hourly_rate:4000}),28000);
});
