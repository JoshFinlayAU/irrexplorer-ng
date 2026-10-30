import { queryOptions } from '@tanstack/react-query'
import {
  fetchAsnReport,
  fetchMemberOf,
  fetchPrefixReport,
  fetchRpslObject,
  fetchSetExpansion,
  fetchStatus,
} from '~/server/functions'

export const prefixQuery = (prefix: string) =>
  queryOptions({
    queryKey: ['prefix', prefix],
    queryFn: () => fetchPrefixReport({ data: { prefix } }),
  })

export const asnQuery = (asn: number) =>
  queryOptions({
    queryKey: ['asn', asn],
    queryFn: () => fetchAsnReport({ data: { asn } }),
  })

export const SET_DEPTH_LIMIT = 1000

export const setQuery = (name: string, category: 'as-set' | 'route-set') =>
  queryOptions({
    queryKey: ['set', name, SET_DEPTH_LIMIT, category],
    queryFn: () => fetchSetExpansion({ data: { name, category } }),
  })

export const memberOfQuery = (target: string, objectClass: 'as-set' | 'route-set') =>
  queryOptions({
    queryKey: ['member-of', objectClass, target],
    queryFn: () => fetchMemberOf({ data: { target, objectClass } }),
  })

export const rpslObjectQuery = (rpslPk: string, source: string, objectClass: 'route' | 'route6') =>
  queryOptions({
    queryKey: ['rpsl', source, rpslPk],
    queryFn: () => fetchRpslObject({ data: { rpslPk, source, objectClass } }),
    staleTime: 10 * 60_000,
  })

export const statusQuery = () =>
  queryOptions({
    queryKey: ['status'],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
  })
