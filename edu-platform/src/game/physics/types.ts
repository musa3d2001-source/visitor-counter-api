/**
 * واجهة Rapier3D التي نحتاجها. الحزمتان (split و -compat) تطابقانها، والثنائي WASM واحد فيهما.
 * استيراد نوع فقط: يُمحى عند الترجمة، فلا يدخل الحزمة split في رسم الخادم.
 */
export type Rapier = typeof import("@dimforge/rapier3d-deterministic");
