/**
 * «Obras relacionadas» (RF-212, RF-217): the block of the record and nothing
 * else.
 *
 * One export on purpose. The record mounts `<RelationshipsSection catalogId
 * search />` and needs to know nothing about kinds, directions or thumbnails;
 * everything else in this folder is reachable by its own path for whoever has a
 * reason — the tests do — without it looking like part of the contract.
 */
export { RelationshipsSection } from './RelationshipsSection'
