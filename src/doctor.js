import { artifactPaths, projectStatus } from "./sync.js";
import { readFileNoFollow } from "./fs-safe.js";
import { SqliteGraphStore } from "./store.js";

export async function diagnoseProject(root) {
  const paths = artifactPaths(root);
  let store;
  try {
    for (const journal of [paths.publication, paths.publicationArtifacts, paths.rebuild]) {
      try {
        await readFileNoFollow(journal);
        return {
          ok: false,
          graph_status: "STALE",
          error: { code: "RECOVERY_PENDING", message: `Derived-state recovery is pending: ${journal}` },
          recovery: "Run codegraph sync, or codegraph rebuild if the recovery journal is invalid.",
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    store = new SqliteGraphStore(paths.db, { readOnly: true });
    const integrity = store.quickCheck();
    let state = null;
    let mapRevision = null;
    try {
      state = JSON.parse((await readFileNoFollow(paths.state)).toString("utf8"));
    } catch {}
    try {
      const map = (await readFileNoFollow(paths.map)).toString("utf8");
      mapRevision = Number(map.match(/^GRAPH_REVISION = (\d+)$/mu)?.[1] ?? NaN);
    } catch {}
    const freshness = integrity.ok ? await projectStatus(root) : null;
    const materializationConsistent = state?.graph_revision === integrity.current_revision
      && mapRevision === integrity.current_revision
      && freshness?.materialized === true;
    const graphStatus = integrity.ok
      ? (materializationConsistent ? freshness.graph_status : "STALE")
      : "BROKEN";
    return {
      ok: integrity.ok && materializationConsistent && graphStatus === "FRESH",
      graph_status: graphStatus,
      integrity,
      state_revision: state?.graph_revision ?? null,
      map_revision: Number.isNaN(mapRevision) ? null : mapRevision,
      materialization_consistent: materializationConsistent,
      freshness,
      recovery: integrity.ok
        ? (graphStatus === "FRESH"
          ? null
          : "Run codegraph sync; inspect any stale/parse-failed source reported by status.")
        : "Run codegraph rebuild; source files are not modified by recovery.",
    };
  } catch (error) {
    return {
      ok: false,
      graph_status: "BROKEN",
      error: { code: error.code ?? "GRAPH_CORRUPTED", message: error.message },
      recovery: "Run codegraph rebuild; source files are not modified by recovery.",
    };
  } finally {
    store?.close();
  }
}
