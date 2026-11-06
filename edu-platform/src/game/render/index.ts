/**
 * العرض (عميل فقط، three.js): يُستورد بـ import() من game.ts عند وجود canvas، فلا يدخل three
 * في رسم الخادم ولا في الاختبارات بلا واجهة. style.ts بيانات خالصة تستعملها الواجهة مباشرة.
 */
export { createScene, type GameScene, type Quality, type SceneInfo, type SceneOptions } from "./scene";
