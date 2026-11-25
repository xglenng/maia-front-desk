import {z} from 'zod';
import {calendarClientSchema} from './calendar-client-schema';
export const clientBirthDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Use a full date of birth.').refine(value=>{const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value&&value<=new Date().toISOString().slice(0,10)&&value>='1900-01-01';},'Enter a valid date of birth in the past.');
export const newClientInput=z.object({name:z.string().trim().min(2).max(160),email:calendarClientSchema.shape.email,phone:calendarClientSchema.shape.phone,dateOfBirth:clientBirthDate.optional()}).strict();
