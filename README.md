# async-idb-orm

Development monorepo template for **async-idb-orm**.

## Structure

- `.github`
  - Contains workflows used by GitHub Actions.
- `package`
  - Contains the individual packages managed in the monorepo.
  - [async-idb-orm](https://github.com/LankyMoose/async-idb-orm/blob/main/packages/lib)
- `sandbox`
  - Contains example applications and random tidbits.

## Tasks

- Use `make build` to recursively run the build script in each package
- Use `make test` to recursively run the test script in each package
