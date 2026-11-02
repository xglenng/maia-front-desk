import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDate,calendarDate,calendarHoursSchema,nativeDeposit } from '../native-calendar-policy';
import { localDateTimeToUtc } from '../../booking/src/time';
test('native calendar validates repeating hours and permits adjacent split shifts',()=>{
 const row={dayOfWeek:1,startMinute:540,endMinute:720};
 assert.equal(calendarHoursSchema.safeParse([row,{...row,startMinute:720,endMinute:1020}]).success,true);
 assert.equal(calendarHoursSchema.safeParse([row,{...row,startMinute:600}]).success,false);
 assert.equal(calendarHoursSchema.safeParse([{...row,dayOfWeek:7}]).success,false);
 assert.equal(calendarHoursSchema.safeParse([{...row,endMinute:540}]).success,false);
 assert.equal(calendarHoursSchema.safeParse([]).success,true);
});
test('date ranges handle month/year boundaries and reject impossible dates',()=>{
 assert.equal(calendarDate('2026-02-30'),false);assert.equal(calendarDate('2028-02-29'),true);
 assert.equal(addCalendarDate('2026-12-28',7),'2027-01-04');
 assert.equal(localDateTimeToUtc('2026-03-08T02:30','America/Denver').getTime(),NaN);
 assert.equal(localDateTimeToUtc('2026-10-20T14:00','America/Denver').toISOString(),'2026-10-20T20:00:00.000Z');
});
test('native manual booking calculates service deposit without accepting a client override',()=>{
 assert.equal(nativeDeposit({depositType:'PERCENT',depositAmountCents:null,depositPercent:25},25000),6250);
 assert.equal(nativeDeposit({depositType:'FIXED',depositAmountCents:5000,depositPercent:null},25000),5000);
 assert.equal(nativeDeposit({depositType:'NONE',depositAmountCents:null,depositPercent:null},25000),0);
 assert.throws(()=>nativeDeposit({depositType:'PERCENT',depositAmountCents:null,depositPercent:101},25000));
});

test('rescheduling is limited to confirmed native appointments',async()=>{
 const {canRescheduleNative,rescheduleSchema}=await import('../native-calendar-policy');
 assert.equal(canRescheduleNative('CONFIRMED','INTERNAL',null),true);
 for(const status of ['PAYMENT_PENDING','COMPLETED','CANCELLED','PAYMENT_RECEIVED_SLOT_UNAVAILABLE'])assert.equal(canRescheduleNative(status,'INTERNAL',null),false);
 assert.equal(canRescheduleNative('CONFIRMED','SQUARE',null),false);
 assert.equal(canRescheduleNative('CONFIRMED','INTERNAL','external'),false);
 assert.equal(rescheduleSchema.safeParse({}).success,false);
});

test('extra calendar time is bounded and retains revision protection',async()=>{
 const {rescheduleSchema}=await import('../native-calendar-policy');
 const request={organizationId:'11111111-1111-4111-8111-111111111111',artistId:'22222222-2222-4222-8222-222222222222',appointmentId:'33333333-3333-4333-8333-333333333333',localStart:'2026-11-03T09:00',expectedRevision:2};
 assert.equal(rescheduleSchema.parse({...request,extraMinutes:30}).extraMinutes,30);
 for(const extraMinutes of [-1,241,1.5])assert.equal(rescheduleSchema.safeParse({...request,extraMinutes}).success,false);
 assert.equal(rescheduleSchema.safeParse({...request,extraMinutes:30,expectedRevision:undefined}).success,false);
});

test('extra time supports unpaid internal bookings without permitting external or cancelled bookings',async()=>{
 const {canExtendNative}=await import('../native-calendar-policy');
 assert.equal(canExtendNative('PAYMENT_PENDING','INTERNAL',null),true);
 assert.equal(canExtendNative('CONFIRMED','INTERNAL',null),true);
 assert.equal(canExtendNative('CANCELLED','INTERNAL',null),false);
 assert.equal(canExtendNative('PAYMENT_PENDING','SQUARE',null),false);
 assert.equal(canExtendNative('PAYMENT_PENDING','INTERNAL','external'),false);
});
