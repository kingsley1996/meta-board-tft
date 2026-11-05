import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, type PlayerProfile } from './protocol.ts';
import { TempleRooms, type RoomMember } from './rooms.ts';

// Một thành viên giả: send() ghi lại nguyên bytes mà phòng đưa cho nó, nên test kiểm
// tra được "ai nhận gì" — cả tin JSON lẫn frame nhị phân — mà không phải dựng server.
function member(id: number, temple = 'nhattru', room = 'chung'): { member: RoomMember; inbox: Buffer[] } {
  const profile: PlayerProfile = { id, name: `Phật Tử ${id}`, level: 1 };
  const inbox: Buffer[] = [];
  return {
    member: {
      profile,
      state: readState(profile, { x: id, z: 0, y: 0, r: 0, seat: -1, a: 0 }),
      hidden: false,
      // dirty = false: muốn xem một nhịp gửi gì thì phải làm cho người đổi chuyển động.
      dirty: false,
      temple,
      room,
      send: (payload) => inbox.push(Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload))),
    },
    inbox,
  };
}

const texts = (inbox: Buffer[]) => inbox.map((frame) => frame.toString('utf8'));

test('publish reaches the whole room except the actor', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);
  const frame = JSON.stringify({ t: 'lantern', name: 'Phật Tử 1', text: 'Nguyện an lành' });

  rooms.publish('nhattru', 'chung', frame, 1);
  assert.deepEqual(texts(a.inbox), []);
  assert.deepEqual(texts(b.inbox), [frame]);

  // Không có exceptId thì cả phòng cùng nhận, kể cả chính người phát.
  rooms.publish('nhattru', 'chung', frame);
  assert.equal(a.inbox.length, 1);

  // Chùa khác và phòng khác của cùng một chùa không bị lẫn tin.
  const other = member(3, 'kimquang');
  const nextdoor = member(4, 'nhattru', 'tay');
  rooms.add(other.member);
  rooms.add(nextdoor.member);
  rooms.publish('nhattru', 'chung', frame);
  assert.deepEqual(other.inbox, []);
  assert.deepEqual(nextdoor.inbox, []);
});

test('publish to a room nobody is in is a no-op', () => {
  const rooms = new TempleRooms();
  rooms.publish('nhattru', 'khong-co-ai', JSON.stringify({ t: 'lantern' }));
  assert.equal(rooms.size, 0);
});

test('a delta tick carries only the member who moved', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);
  rooms.markDirty(a.member, readState(a.member.profile, { x: 7, z: 2 }));
  // now = 1: chưa tới mốc snapshot đầy nên cả phòng nhận cùng một frame, trong đó chỉ
  // có một người.
  rooms.tick(1);
  for (const inbox of [a.inbox, b.inbox]) {
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].readUInt8(0), 1);
    assert.equal(inbox[0].readUInt16LE(3), 1);
    assert.equal(inbox[0].readUInt32LE(5), 1);
  }
  // Nhịp kế tiếp không còn gì để gửi: dirty đã được dọn.
  a.inbox.length = 0;
  rooms.tick(2);
  assert.equal(a.inbox.length, 0);
});

test('a member who leaves is named in the next frame for those who stay', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);

  rooms.remove(a.member);
  rooms.tick(1);
  assert.equal(rooms.size, 1);
  // Không chỉ ngừng gửi cho người cũ: người còn lại phải được báo ai vừa rời để avatar
  // ma bị xoá trên máy khách (room.ts đọc danh sách "gone" ở cuối frame).
  const frame = b.inbox[0];
  assert.equal(frame.readUInt8(0), 1);
  assert.equal(frame.readUInt16LE(3), 0);
  assert.equal(frame.readUInt16LE(5), 1);
  assert.equal(frame.readUInt32LE(7), 1);
});
