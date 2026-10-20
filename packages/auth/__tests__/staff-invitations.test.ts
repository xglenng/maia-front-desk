import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { acceptStaffInviteSchema, staffInviteSchema } from '../staff-invitations';
test('staff invites normalize email and require a scoped artist reference', () => {
  assert.equal(staffInviteSchema.parse({artistId:randomUUID(),email:' Person@Example.Test '}).email,'person@example.test');
  assert.equal(staffInviteSchema.safeParse({artistId:'wrong',email:'x@example.test'}).success,false);
});
test('accepting invitations requires a strong token and signup-length password', () => {
  const input = {token:'a'.repeat(64),email:'artist@example.test',password:'synthetic-password'};
  assert.equal(acceptStaffInviteSchema.safeParse(input).success,true);
  for (const patch of [{token:'short'},{password:'short'},{password:'x'.repeat(129)},{email:'wrong'}]) assert.equal(acceptStaffInviteSchema.safeParse({...input,...patch}).success,false);
});
test('add team member accepts Artist/Apprentice and rejects ambiguous or unsafe roles', () => {
  const input = {name:' New Apprentice ',email:' Member@Example.Test ',memberType:'APPRENTICE'};
  const parsed=staffInviteSchema.parse(input);
  assert.equal(parsed.name,'New Apprentice');
  assert.equal(parsed.email,'member@example.test');
  for(const patch of [{name:' '},{memberType:'OWNER'},{memberType:undefined},{artistId:randomUUID()}]) assert.equal(staffInviteSchema.safeParse({...input,...patch}).success,false);
});
