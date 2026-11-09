import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogOfferings, gradeStats, listGrades, listStages, listSubjects, listTeachers, getTeacherBySlug, sitemapEntries } from "@/server/catalog/queries";
import { resetEnvCache } from "@/server/env";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createContainer, createProduct, createTeacher, createVideoProduct, gradeAndSubject } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

/** كل رقم وقائمة عامة تتبع قاعدة «ما لا يُباع لا يُعرض»: لا صف ولا مادة ولا عدد يقوم على فيديو مغلق */
beforeAll(resetDb);
afterAll(closeDb);
beforeEach(async () => {
  await sql`delete from bundle_items`;
  await sql`delete from lessons`;
  await sql`delete from product_files`;
  await sql`delete from products`;
  await sql`delete from teacher_subjects`;
  await sql`delete from teachers`;
  await sql`delete from settings`;
});
afterEach(() => {
  delete process.env.ALLOW_FILE_VIDEO;
  for (const k of ["VIDEO_PROVIDER", "BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_API_KEY"]) delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

const videosOff = () => sql`insert into settings (key, value) values ('videos_enabled', 'false'::jsonb) on conflict (key) do update set value = excluded.value`;
function production(extra: Record<string, string> = {}) {
  (process.env as Record<string, string>).NODE_ENV = "production";
  Object.assign(process.env, extra);
  resetEnvCache();
}
const BUNNY_ENV = { VIDEO_PROVIDER: "bunny", BUNNY_STREAM_LIBRARY_ID: "1", BUNNY_STREAM_API_KEY: "a", BUNNY_STREAM_TOKEN_KEY: "t", BUNNY_STREAM_READONLY_API_KEY: "r" };

const levels = async () => (await listGrades()).map((g) => g.level);

const CLOSERS = [
  { name: "the owner turned videos off", close: videosOff as () => unknown },
  { name: "production with raw files and no permission", close: () => production() },
];

describe.each(CLOSERS)("video closed: $name", ({ close }) => {
  it("a grade holding only closed video is not listed, and neither is it counted", async () => {
    await createProduct({ level: 6, subjectSlug: "math" });
    await createVideoProduct({ level: 7, subjectSlug: "science" });
    expect(await levels()).toEqual([6, 7]);
    await close();
    expect(await levels()).toEqual([6]);
    const { id } = (await listGrades())[0];
    expect(Object.fromEntries((await gradeStats()).entries())[id]).toEqual({ subjects: 1, products: 1 });
    expect([...(await gradeStats()).keys()]).toEqual([id]);
    expect((await listStages()).flatMap((s) => s.grades).map((g) => g.level)).toEqual([6]);
  });

  it("subject counts leave out closed video", async () => {
    await createProduct({ level: 6, subjectSlug: "math" });
    await createVideoProduct({ level: 6, subjectSlug: "math" });
    await createVideoProduct({ level: 6, subjectSlug: "science" });
    const { gradeId } = await gradeAndSubject(6, "math");
    const counts = async () => Object.fromEntries((await listSubjects(gradeId)).map((s) => [s.slug, s.productCount]));
    expect(await counts()).toEqual({ math: 2, science: 1 });
    await close();
    expect(await counts()).toEqual({ math: 1 });
  });

  it("the sitemap has no subject that only closed video filled", async () => {
    await createProduct({ level: 6, subjectSlug: "math" });
    await createVideoProduct({ level: 6, subjectSlug: "science" });
    await close();
    const { subjects, grades } = await sitemapEntries();
    expect(subjects.map((s) => s.slug)).toEqual(["math"]);
    expect(grades.map((g) => g.level)).toEqual([6]);
  });

  it("a teacher whose only link to a grade or subject is closed video is not filed under it", async () => {
    const t = await createTeacher();
    await createVideoProduct({ teacherId: t.id, level: 7, subjectSlug: "science" });
    const { gradeId, subjectId } = await gradeAndSubject(7, "science");
    const found = async () => [(await listTeachers({ gradeId })).length, (await listTeachers({ subjectId })).length];
    expect(await found()).toEqual([1, 1]);
    await close();
    expect(await found()).toEqual([0, 0]);
  });

  it("a teacher's own declared subject is kept, and closed video adds none", async () => {
    const t = await createTeacher();
    const declared = await gradeAndSubject(6, "math");
    await sql`insert into teacher_subjects (teacher_id, subject_id) values (${t.id}, ${declared.subjectId})`;
    await createVideoProduct({ teacherId: t.id, level: 7, subjectSlug: "science" });
    const subjects = async () => (await listTeachers())[0].subjects.map((s) => s.slug);
    expect((await subjects()).sort()).toEqual(["math", "science"]);
    await close();
    expect(await subjects()).toEqual(["math"]);
    expect((await listTeachers({ subjectId: declared.subjectId })).length).toBe(1);
  });

  it("a teacher's lesson count and running time are zero", async () => {
    const t = await createTeacher();
    await createVideoProduct({ teacherId: t.id, lessons: 3 });
    const before = (await listTeachers())[0];
    expect([before.videoCount, before.totalDurationSeconds]).toEqual([3, 180]);
    await close();
    const after = (await listTeachers())[0];
    expect([after.videoCount, after.totalDurationSeconds, after.productCount]).toEqual([0, 0, 0]);
    expect((await getTeacherBySlug(t.slug))?.videoCount).toBe(0);
  });

  it("what the site says it offers follows the same rule", async () => {
    await createProduct({ level: 6 });
    await createVideoProduct({ level: 7 });
    expect(await catalogOfferings()).toMatchObject({ video: true, notes: true, content: true });
    await close();
    expect(await catalogOfferings()).toMatchObject({ video: false, notes: true, content: true });
  });

  it("nothing but closed video: the site says it has nothing", async () => {
    await createVideoProduct({ level: 7 });
    await close();
    expect(await catalogOfferings()).toMatchObject({ video: false, notes: false, content: false });
    expect(await levels()).toEqual([]);
  });
});

describe("with only raw files closed (Bunny live, old raw files left)", () => {
  beforeEach(() => production(BUNNY_ENV));

  it("Bunny lessons still count, raw ones do not", async () => {
    const t = await createTeacher();
    await createVideoProduct({ teacherId: t.id, provider: "bunny", lessons: 2 });
    await createVideoProduct({ teacherId: t.id, provider: "file", lessons: 3 });
    const card = (await listTeachers())[0];
    expect([card.videoCount, card.productCount]).toEqual([2, 1]);
  });

  it("a container hidden for a raw file inside it adds none of its own lessons to the count", async () => {
    const t = await createTeacher();
    const inner = await createVideoProduct({ provider: "file", lessons: 1 });
    const outer = await createVideoProduct({ type: "video_course", teacherId: t.id, provider: "bunny", lessons: 4 });
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${outer.id}, ${inner.id}, 0)`;
    expect((await listTeachers())[0].videoCount).toBe(0);
  });

  it("a grade whose only content is a bundle hiding a raw file is not listed", async () => {
    const inner = await createVideoProduct({ provider: "file", lessons: 1, level: 8, status: "hidden" });
    await createContainer({ items: [inner.id], level: 8 });
    expect(await levels()).toEqual([]);
  });

  it("the site still says video is on sale", async () => {
    await createVideoProduct({ provider: "bunny", lessons: 1 });
    expect((await catalogOfferings()).video).toBe(true);
  });
});

describe("with nothing closed", () => {
  it("nothing changes", async () => {
    const t = await createTeacher();
    await createProduct({ level: 6, subjectSlug: "math" });
    await createVideoProduct({ teacherId: t.id, level: 7, subjectSlug: "science", lessons: 2 });
    expect(await levels()).toEqual([6, 7]);
    expect((await listTeachers())[0].videoCount).toBe(2);
  });
});

describe("what the site says it offers", () => {
  it("an empty site offers nothing", async () => {
    expect(await catalogOfferings()).toEqual({ video: false, notes: false, content: false, teachers: 0 });
  });

  it("counts published teachers only", async () => {
    await createTeacher();
    const hidden = await createTeacher();
    await sql`update teachers set is_published = false where id = ${hidden.id}`;
    expect((await catalogOfferings()).teachers).toBe(1);
  });

  it("a draft product is not an offer", async () => {
    await createProduct({ status: "draft" });
    expect((await catalogOfferings()).content).toBe(false);
  });

  it("a video product with no ready lesson is not video on sale", async () => {
    await createVideoProduct({ ready: false });
    expect(await catalogOfferings()).toMatchObject({ video: false, content: true });
  });

  it("a bundle of notes is not a note on its own", async () => {
    const note = await createProduct({ status: "hidden" });
    await createContainer({ items: [note.id] });
    expect(await catalogOfferings()).toMatchObject({ notes: false, content: true });
  });
});
