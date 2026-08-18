# book1 independent Java oracle

This oracle was authored from the local `VinaBookStore` source before CodeGraph was run against it.

- Identity: non-Git source fingerprint `eb60c3e50f50a33b13d9ebe1b2889ec23127a3eb1009d5c949cb9ba482ae8d86`
- Scope: 58 Java files, `pom.xml`, and `src/main/resources/application.properties`; `target/` and generated CodeGraph state are excluded.
- Profile: Maven, Java 17, Spring Boot/MVC/Data/JPA.
- Production architecture: controllers/API classes directly use Spring Data repositories; authentication uses JWT/security services; checkout converts cart details to orders and updates inventory; mail uses an overloaded queued service.
- Safe known gaps: runtime Spring field injection/routes, generated Spring Data methods, native SQL annotation content, filter-chain callbacks, and lambdas remain dynamic or incomplete boundaries.

The machine-readable oracle contains 30 audited entities, 17 audited relations, ten retrieval cases, two overload cases, and source references for five real flows.
