export type DeparturePickupsDto = {
  departure_id: number;
  pickups: { dep_pickup_id: number; pickup_id: number; name: string; address: string; pickup_time: string }[];
};
