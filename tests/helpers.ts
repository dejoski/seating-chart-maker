import { Chart, emptyChart, Guest, Table } from '../src/lib/model';
export function g(name: string, extra: Partial<Guest> = {}): Guest { return { id: name, name, group: '', meal: '', notes: '', party: '', ...extra }; }
export function t(id: string, seats: number, x = 0, y = 0): Table { return { id, name: id, shape: 'round', seats, x, y }; }
export function chart(guests: Guest[], tables: Table[], extra: Partial<Chart> = {}): Chart { return { ...emptyChart('wedding'), guests, tables, ...extra }; }
