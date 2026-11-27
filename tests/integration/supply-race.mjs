import assert from "node:assert/strict";
import { moveSupply, readSupplies } from "../../src/server/services/departure-supplies.ts";
import { receiveSupply, readSupplyItem } from "../../src/server/services/inventory.ts";

export async function verifySupplyRace(db, actor, departureId, recipientId, whileBlocked) {
  const item = await db.supplyItem.create({ data: { name: "Supply race", category: "Drink", unit: "bottle" } });
  const data = { item_id: item.item_id, quantity: 5, idempotency_key: "race-supply-receive" };
  await receiveSupply(db, actor, data);
  const move = (type, key, quantity = 4, departure = departureId) => moveSupply(db, actor, departure, type, {
    ...data, quantity, recipient_staff_id: recipientId, idempotency_key: key, note: "Trip allocation",
  });
  for (const type of ["Issue", "Return"]) {
    const keys = [`supply-race-${type}-left`, `supply-race-${type}-right`];
    const results = await whileBlocked("SELECT item_id FROM supply_items WHERE item_id = $1 FOR UPDATE", [item.item_id],
      () => keys.map(key => move(type, key)), undefined, 2);
    const winner = results.findIndex(result => result.status === "fulfilled");
    assert.notEqual(winner, -1);
    assert.equal(results[1 - winner].reason.code, "RESOURCE_CONFLICT");
    const replay = await move(type, keys[winner]);
    assert.equal(replay.txn_id, results[winner].value.txn_id);
    await assert.rejects(move(type, keys[winner], 1), { code: "RESOURCE_CONFLICT" });
    await assert.rejects(move(type, "wrong-departure-test", 1, 2147483647), { code: "NOT_FOUND" });
    assert.equal((await readSupplyItem(db, actor, item.item_id)).on_hand, type === "Issue" ? 1 : 5);
  }
  assert.equal((await readSupplies(db, actor, departureId)).items[0].remaining, 0);
  console.log("PASS: concurrent issues and returns serialize, preserve balances and replay once.");

  // The status must be re-read after an overlapping trip closure, before taking stock.
  await db.departure.update({ where: { departure_id: departureId }, data: { status: "Running" } });
  const closing = await whileBlocked("SELECT departure_id FROM departures WHERE departure_id = $1 FOR UPDATE", [departureId],
    () => [move("Issue", "supply-issue-during-end", 1)],
    connection => connection.query("UPDATE departures SET status = 'Ended' WHERE departure_id = $1", [departureId]), 1);
  assert.equal(closing[0].status, "rejected");
  assert.equal(closing[0].reason.code, "RESOURCE_CONFLICT");
  assert.equal(await db.supplyTransaction.count({ where: { idempotency_key: "supply-issue-during-end" } }), 0);
  assert.equal((await readSupplyItem(db, actor, item.item_id)).on_hand, 5);
  await db.departure.update({ where: { departure_id: departureId }, data: { status: "Draft" } });
  console.log("PASS: a supply issue waiting on an ending trip rechecks status and leaves stock unchanged.");
}
