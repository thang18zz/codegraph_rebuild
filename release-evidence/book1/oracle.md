# Book1 independent public Java oracle

This oracle was authored by inspecting the pinned public `VinaBookStore` source before CodeGraph was run against it.

- Repository: `https://github.com/thang18zz/book_store.git`
- Commit: `44455ee3792bbca84d0379feff862f66a4426d3e`
- Project: `book1/book/book/VinaBookStore`
- Source fingerprint: `0b5548df5d1da1ad91f5a148dc7e56c40458a981e8d5d53661cdefa2130256c3`
- Scope: 58 Java files (57 production, one test), `pom.xml`, and `src/main/resources/application.properties`; `target/` and generated CodeGraph state are excluded.
- Profile: Maven, Java 17, Spring Boot/MVC/Data/JPA.
- Production architecture: controllers/API classes directly use Spring Data repositories; authentication uses JWT/security services; checkout converts cart details to orders and updates inventory; mail uses an overloaded queued service.
- Safe known gaps: runtime Spring field injection/routes, generated Spring Data methods, native SQL annotation content, filter-chain callbacks, and lambdas remain dynamic or incomplete boundaries.

The machine-readable oracle contains 30 required entities, 17 required relations, complete entity audit scopes for 35 declarations, semantic HIGH-relation audit scopes, ten retrieval cases, two overload cases, and source references for six real flows. Lines remain evidence locators only; audited identity is based on qualified semantic names.
