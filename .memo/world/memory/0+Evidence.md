---
type = "surprise"
key = "init-mutates-shared-component"
---
select.tui .init()/.does() mutate the shared Component and return the same function, so two 'separate' components built via List.init(a) and List.init(b) are one component; build distinct ui(source) components to compare instances.