export type SeatMapDto = {
  departure_id: number;
  vehicles: { dep_vehicle_id: number; vehicle_type: string; seats: {
    dep_seat_id: number; seat_name: string; floor_level: number; x_position: number; y_position: number;
    status: "Available" | "Locked" | "Sold" }[] }[];
};
