import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractLessons } from "../domain/lessons.js";

describe("agent/lessons", () => {
  it("tách dòng LESSON khỏi câu trả lời", () => {
    const r = extractLessons("Đúng, finding này sai.\nLESSON: Không báo lỗi console.log trong thư mục scripts/\nCảm ơn.");
    assert.deepEqual(r.lessons, ["Không báo lỗi console.log trong thư mục scripts/"]);
    assert.equal(r.reply, "Đúng, finding này sai.\nCảm ơn.");
  });
  it("bỏ bài học quá ngắn và trùng, tối đa 3", () => {
    const r = extractLessons("a\nLESSON: ngắn\nLESSON: Bài học số một dài đủ\nLESSON: Bài học số một dài đủ\nLESSON: Bài học hai dài đủ\nLESSON: Bài học ba dài đủ\nLESSON: Bài học bốn dài đủ");
    assert.equal(r.lessons.length, 3);
  });
  it("không có LESSON → giữ nguyên", () => assert.deepEqual(extractLessons("xin chào"), { reply: "xin chào", lessons: [] }));
});
