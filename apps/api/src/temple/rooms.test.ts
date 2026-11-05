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

test('the online count on the wire is the number of people standing in the room', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);

  // Một lượt vào chưa kịp gỡ lượt trước (tab nối lại, gói 'join' thứ hai trên cùng socket)
  // không được biến một người thành hai người.
  const again = member(1);
  rooms.add(again.member);
  assert.equal(rooms.size, 2);

  rooms.markDirty(again.member, readState(again.member.profile, { x: 3, z: 3 }));
  rooms.tick(1);
  const frame = b.inbox[0];
  assert.equal(frame.readUInt8(0), 1, 'delta');
  assert.equal(frame.readUInt16LE(1), 2, 'online');
  assert.equal(frame.readUInt16LE(3), 1, 'one member moved');
  assert.equal(rooms.snapshotOf(b.member).readUInt16LE(1), 2, 'snapshot counts the same');
});

test('publish reaches the whole room except the actor', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);
  const frame = JSON.stringify({ t: 'say', name: 'Phật Tử 1', text: 'Nguyện an lành' });

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
  rooms.publish('nhattru', 'khong-co-ai', JSON.stringify({ t: 'say' }));
  assert.equal(rooms.size, 0);
});

// Tin riêng thì phải tới đúng một người, dù hai người không đứng cùng chánh điện:
// nhắn nhủ và lời mời kết bạn không được tràn ra cả phòng như emote.
test('notify reaches one player wherever they are standing', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  const elsewhere = member(3, 'nhattru', 'tay');
  const otherTemple = member(4, 'kimquang');
  for (const m of [a, b, elsewhere, otherTemple]) rooms.add(m.member);

  const note = JSON.stringify({ t: 'dm', by: { id: 1, name: 'Phật Tử 1' }, text: 'A Di Đà Phật' });
  rooms.notify(2, note);
  assert.deepEqual(texts(b.inbox), [note]);
  assert.deepEqual(texts(a.inbox), []);
  assert.deepEqual(texts(elsewhere.inbox), []);
  assert.deepEqual(texts(otherTemple.inbox), []);

  // Người đã rời phòng thì không còn ai để báo; id lạ cũng vậy.
  rooms.remove(b.member);
  rooms.notify(2, note);
  rooms.notify(99, note);
  assert.equal(b.inbox.length, 1);
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

// Một frame không được vừa đứng tên ai đó vừa báo người đó đã đi: máy khách đọc entries
// trước rồi đến gone, nên người may mắn bị xoá mất avatar — và mất luôn hồ sơ, vì prof
// chỉ được phát lại khi người đó join hoặc đổi đồ.
test('a member who rejoins before the next tick is not announced as gone', () => {
  const rooms = new TempleRooms();
  const a = member(1);
  const b = member(2);
  rooms.add(a.member);
  rooms.add(b.member);

  // Đúng thứ tự của một cú đá tab cũ (ws.ts:123) hoặc một socket đóng muộn: remove ghi
  // id vào gone, rồi lượt vào mới đứng tên lại cùng id đó trong cùng một nhịp.
  const fresh = member(1);
  rooms.remove(a.member);
  rooms.add(fresh.member);
  rooms.markDirty(fresh.member, readState(fresh.member.profile, { x: 4, z: 1 }));
  rooms.tick(1);

  const frame = b.inbox[0];
  const n = frame.readUInt16LE(3);
  const ids: number[] = [];
  for (let o = 5; o < 5 + n * 15; o += 15) ids.push(frame.readUInt32LE(o));
  const goneAt = 5 + n * 15;
  const gone: number[] = [];
  for (let i = 0, o = goneAt + 2; i < frame.readUInt16LE(goneAt); i++, o += 4) gone.push(frame.readUInt32LE(o));

  assert.equal(frame.readUInt16LE(1), 2, 'two people are standing in the hall');
  assert.deepEqual(ids, [1], 'and the rejoiner is one of them');
  assert.deepEqual(gone, [], 'yet nobody left');
});
