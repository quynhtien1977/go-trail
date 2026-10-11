import fs from 'fs';
import path from 'path';

const FETCHED_AT = '2026-10-11T04:15:00Z'; // UTC timestamp of crawl

const routes = [
  {
    slug: 'ba-den',
    source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
    source_title: 'Trail Bus - Bà Đen - Go Trail',
    trip: {
      name: 'Trekking Núi Bà Đen',
      city: 'Tây Ninh',
      district: 'TP. Tây Ninh',
      location_name: 'Núi Bà Đen',
      difficulty_level: null,
      length_km: '5.5',
      peak_height_m: 986,
      base_price: '493000',
      description: 'Chinh phục "nóc nhà Đông Nam Bộ" cao 986m tại Tây Ninh. Tuyến trekking men theo đường Cột Điện qua rừng rậm và các dốc đá tự nhiên, lên đỉnh ngắm toàn cảnh đồng bằng Tây Ninh và viếng quần thể tâm linh Bà Đen.',
      schedule_content: '04:30 Khởi hành từ TP.HCM → 08:00 Trekking đường Cột Điện lên đỉnh 986m → 13:00 Xuống núi (hoặc cáp treo tự túc) → 16:30 Tắm rửa, ăn tối chân núi → 18:30 Khởi hành về TP.HCM (dự kiến đến 21:30).'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '530000',
      displayed_price_vnd: '493000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành trung tâm TP.HCM',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi gửi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội chân núi',
        address: 'Trạm dừng chân khu vực gửi xe đường Cột Điện, Chân Núi Bà Đen, Tây Ninh',
        time_local: '08:00',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
        section: 'trail-detail',
        observed_value: '~5,5 km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
        section: 'trail-detail',
        observed_value: 'Độ cao đỉnh 986m (độ cao tích lũy 907m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-4.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 493,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-ba-den/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_0_price: 530000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon ảnh i-do-kho-4.svg, không có nhãn text tường minh trên giao diện; theo quy ước handoff đặt null và ghi nhận'
      },
      {
        field: 'trip.length_km',
        reason: 'Nguồn ghi ~5,5 km ở phần thông số, trong khi lịch trình chi tiết ghi 11km khứ hồi'
      },
      {
        field: 'ticket',
        reason: 'Gói VÉ NHẬP HỘI có xung đột giá hiển thị giữa 232,000 VND (Cấu trúc chi phí) và 233,000 VND (Meta trải nghiệm)'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2026/02/PHOR7222.JPG_compressed.jpeg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-4.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2026/02/PHOR7323.JPG_compressed-1.jpeg', alt: 'Cung đường leo núi Bà Đen' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/06/trail-bus-da-bac-hoa-binh-nguoi-dan-duong-1-e1762507170523.jpg', alt: 'Leader dẫn đường Go Trail' },
      { url: 'https://gotrail.vn/wp-content/uploads/2026/03/IMG_2095-scaled.jpg', alt: 'Đoàn trekker Go Trail tại Bà Đen' }
    ]
  },
  {
    slug: 'chua-chan',
    source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
    source_title: 'Trail Bus - Chứa Chan - Go Trail',
    trip: {
      name: 'Trekking Núi Chứa Chan',
      city: 'Đồng Nai',
      district: 'Xuân Lộc',
      location_name: 'Núi Chứa Chan',
      difficulty_level: null,
      length_km: '7.0',
      peak_height_m: 837,
      base_price: '419000',
      description: 'Hành trình trekking ngọn núi cao thứ nhì Đông Nam Bộ (837m) tại huyện Xuân Lộc, Đồng Nai. Cung đường men theo sườn núi rợp bóng cây, viếng chùa Bửu Quang, ngắm cây đa ba gốc huyền bí và phóng tầm mắt nhìn toàn cảnh vùng đồng bằng bao la.',
      schedule_content: '04:30 Đón khách Phan Chu Trinh (Bình Thạnh) → 04:45 Đón khách Sala (Thủ Đức) → 06:30 Đến quán chị Yến chân núi, khởi động → 07:30 Bắt đầu trekking cột điện → 12:00 Check-in đỉnh 837m → 12:30 Hạ sơn qua đường chùa → 15:00 Vệ sinh cá nhân, xe đón về TP.HCM.'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '450000',
      displayed_price_vnd: '419000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM (Pasteur Street Taproom)',
        time_local: '04:45',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội chân núi Chứa Chan',
        address: 'Quán chị Yến, Gia Lào, TT. Gia Ray, H. Xuân Lộc, Đồng Nai',
        time_local: '06:30',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
        section: 'trail-detail',
        observed_value: '~7km (schedule ghi: 7km, 5h di chuyển)'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
        section: 'trail-detail',
        observed_value: 'Độ cao đỉnh 837m (độ cao tích lũy 657m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-2.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 419,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-chua-chan/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_1_price: 450000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-2.svg, không có nhãn text tường minh trên trang'
      },
      {
        field: 'trip.description',
        reason: 'Website nguồn chứa đoạn văn copy-paste dán nhầm mô tả Đỉnh La Bàn / Bán đảo Long Sơn (Núi Dinh) và Pal Sol vào template'
      },
      {
        field: 'assets',
        reason: 'Carousel nổi bật của trang Chứa Chan chứa ảnh Tron-goi-trekking-Lao-Than từ tuyến Lảo Thẩn'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2025/03/35-e1742370003781.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-2.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/PHOR8084-scaled-e1761105954650.jpg', alt: 'Trekker trên sườn núi Chứa Chan' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/IMG_6931-3-e1742812148549.jpg', alt: 'Cung đường Chứa Chan mùa cỏ lau' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/51-e1742351959694.jpg', alt: 'Leader đồng hành cùng đoàn Chứa Chan' }
    ]
  },
  {
    slug: 'nui-dinh',
    source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
    source_title: 'Trail Bus - Núi Dinh - Go Trail',
    trip: {
      name: 'Trekking Núi Dinh',
      city: 'Bà Rịa - Vũng Tàu',
      district: 'Thị xã Phú Mỹ',
      location_name: 'Núi Dinh',
      difficulty_level: null,
      length_km: '8.0',
      peak_height_m: 491,
      base_price: '372000',
      description: 'Cung trekking rừng suối thanh bình chỉ cách TP.HCM chưa đầy 2 giờ di chuyển. Tuyến đi qua những tán rừng xanh mát, suối Tiên, suối Đá và chinh phục đỉnh La Bàn (491m) nhìn bao quát bán đảo Long Sơn và vịnh biển Vũng Tàu.',
      schedule_content: '04:30 Khởi hành Phan Chu Trinh (Bình Thạnh) → 04:45 Đón Sala (Thủ Đức) → 06:30 Đến quán cô Kiều chân Núi Dinh → 07:30 Trekking rừng suối → 10:30 Check-in Đỉnh La Bàn → 11:00 Xuống núi về quán cô Kiều tắm rửa, ăn trưa → 13:30 Xe đón về TP.HCM (về đến khoảng 15:30).'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '399000',
      displayed_price_vnd: '372000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM',
        time_local: '04:45',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội quán cô Kiều',
        address: 'Quán Cô Kiều, Đường Xe Lên Núi Dinh, Tân Hải, TX. Phú Mỹ, Bà Rịa - Vũng Tàu',
        time_local: '06:30',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
        section: 'trail-detail',
        observed_value: '~8km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
        section: 'trail-detail',
        observed_value: 'Độ cao đỉnh 491m (độ cao tích lũy 603m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-2.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 372,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-nui-dinh/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_1_price: 399000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-2.svg, không có nhãn text tường minh trên giao diện'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2025/03/35-1-1024x1024.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-2.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/1-1.jpg', alt: 'Đỉnh La Bàn nhìn ra bán đảo Long Sơn' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/2-1.jpg', alt: 'Cung đường mòn xuyên rừng Núi Dinh' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/4-1.jpg', alt: 'Suối mát trong rừng Núi Dinh' }
    ]
  },
  {
    slug: 'thi-vai',
    source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
    source_title: 'Trail Bus - Thị Vải - Go Trail',
    trip: {
      name: 'Trekking Núi Thị Vải',
      city: 'Bà Rịa - Vũng Tàu',
      district: 'Thị xã Phú Mỹ',
      location_name: 'Núi Thị Vải',
      difficulty_level: null,
      length_km: '4.0',
      peak_height_m: 467,
      base_price: '354000',
      description: 'Chinh phục ngọn núi thanh tịnh tại thị xã Phú Mỹ với hơn 1.000 bậc đá uốn lượn dưới tán rừng nguyên sơ. Đỉnh núi cao ~467m mở ra khung cảnh bồng lai nhìn toàn cảnh vùng hạ lưu sông Thị Vải và cảng Cái Mép.',
      schedule_content: '04:30 Xuất phát từ Phan Chu Trinh (Bình Thạnh) → 04:45 Đón Sala (Thủ Đức) → 07:30 - 12:30 Trekking chinh phục đỉnh Thị Vải cùng Leader → 13:00 Nghỉ ngơi trạm dừng nạp năng lượng → 14:00 Xe khởi hành về lại TP.HCM (về trước 17:00).'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '380000',
      displayed_price_vnd: '354000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM',
        time_local: '04:45',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
        section: 'trail-detail',
        observed_value: '~4km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
        section: 'trail-detail',
        observed_value: '~467m (độ cao tích lũy ~410m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-2.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 354,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-thi-vai/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_0_price: 380000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-2.svg, không có nhãn text tường minh trên giao diện'
      },
      {
        field: 'trip.peak_height_m',
        reason: 'Nguồn dùng ký tự xấp xỉ (~467m); đã chuẩn hóa thành 467'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2026/03/z7475843429565_62f31e2a8f408d4a21adad4cdca40111.jpg_compressed.jpeg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-2.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2026/03/z7475843474279_b4376eed1ac8ab80876537a06cfd4d3c.jpg_compressed.jpeg', alt: 'Bậc thang đá lên núi Thị Vải' },
      { url: 'https://gotrail.vn/wp-content/uploads/2026/03/z7475843512051_6564449714cf003d6e170f65fa687e1f.jpg_compressed.jpeg', alt: 'Cảnh quan rừng núi Thị Vải' },
      { url: 'https://gotrail.vn/wp-content/uploads/2026/03/z7475843269895_88a9bf973fd002ecdce0fb282f1c5668.jpg_compressed.jpeg', alt: 'Điểm vọng cảnh trên đỉnh Thị Vải' }
    ]
  },
  {
    slug: 'ta-cu-ke-ga',
    source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
    source_title: 'Trail Bus Tà Cú - Kê Gà - Go Trail',
    trip: {
      name: 'Trekking Tà Cú - Hải Đăng Kê Gà',
      city: 'Bình Thuận',
      district: 'Hàm Thuận Nam',
      location_name: 'Núi Tà Cú - Mũi Kê Gà',
      difficulty_level: null,
      length_km: '9.0',
      peak_height_m: null,
      base_price: '726000',
      description: 'Hành trình kết hợp trekking rừng núi và khám phá biển đảo độc đáo tại Bình Thuận. Khám phá cung đường rừng núi Tà Cú, viếng tượng Phật nằm 49m trên đỉnh cao 649m, sau đó di chuyển ra bờ biển Mũi Kê Gà chiêm ngưỡng ngọn hải đăng cổ kính nhất Việt Nam.',
      schedule_content: '04:30 Khởi hành Phan Chu Trinh (Bình Thạnh) → 04:45 Đón Sala (Thủ Đức) → 08:00 Khách Nhập hội tập trung tại Cà phê Hương Hùng → Bắt đầu trekking núi Tà Cú viếng chùa và tượng Phật nằm → Di chuyển đến Mũi Kê Gà tham quan ngọn hải đăng → Chiều lên xe khởi hành về lại TP.HCM.'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '780000',
      displayed_price_vnd: '726000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM',
        time_local: '04:45',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội cà phê Hương Hùng',
        address: 'Cà phê Hương Hùng, TT. Thuận Nam, H. Hàm Thuận Nam, Bình Thuận',
        time_local: '08:00',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
        section: 'trail-detail',
        observed_value: '~9km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
        section: 'trail-detail',
        observed_value: 'Độ cao đỉnh: Không (Độ cao tích lũy 480m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-2.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 726,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-ta-cu-ke-ga/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_0_price: 780000'
      }
    ],
    issues: [
      {
        field: 'trip.peak_height_m',
        reason: 'Nguồn ghi Độ cao đỉnh là "Không" ở widget thông số do hành trình kết hợp núi và biển (trong bài có nhắc đỉnh Tà Cú cao 649m); contract quy định chưa xác minh dùng null'
      },
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-2.svg, không có nhãn text tường minh trên giao diện'
      }
    ],
    review_status: 'needs_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2025/11/24-1-1024x1024.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-2.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2025/11/27.jpg', alt: 'Cung đường ven biển và Hải đăng Kê Gà' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/11/19-1.jpg', alt: 'Đoàn khách trải nghiệm Tà Cú Kê Gà' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/51-e1742351959694.jpg', alt: 'Leader dẫn đường Go Trail' }
    ]
  },
  {
    slug: 'cat-tien',
    source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
    source_title: 'Trail Bus - Cát Tiên - Go Trail',
    trip: {
      name: 'Hiking & Cycling Vườn Quốc Gia Cát Tiên',
      city: 'Đồng Nai',
      district: 'Tân Phú',
      location_name: 'Vườn Quốc Gia Cát Tiên',
      difficulty_level: null,
      length_km: '20.0',
      peak_height_m: null,
      base_price: '706000',
      description: 'Hành trình khám phá khu dự trữ sinh quyển thế giới Cát Tiên. Kết hợp đạp xe và đi bộ xuyên rừng nguyên sinh, chiêm ngưỡng các đại thụ ngàn năm như Cây Tung khổng lồ, Cây Gõ Bác Đồng, Cây Đa Lộc Giao và ghé thăm ghềnh Bến Cự hoang sơ.',
      schedule_content: '04:30 Xuất phát từ Phan Chu Trinh (Bình Thạnh) → 04:45 Đón Sala (Thủ Đức) → 08:00 Qua phà vào Vườn Quốc Gia, nhận xe đạp → 08:30 - 12:30 Đạp xe xuyên rừng, ghé Bến Cự, Cây Đa Lộc Giao, Cây Gõ Bác Đồng → 12:30 Nghỉ trưa → 13:30 Hiking thăm Cây Tung cổ thụ → 16:00 Lên xe về TP.HCM (dự kiến đến 21:00).'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '759000',
      displayed_price_vnd: '706000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM',
        time_local: '04:45',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội cổng Vườn Quốc Gia Cát Tiên',
        address: 'Cổng Vườn Quốc Gia Cát Tiên, Xã Nam Cát Tiên, H. Tân Phú, Đồng Nai',
        time_local: '08:00',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
        section: 'trail-detail',
        observed_value: '~20km (gồm kết hợp đi bộ và đạp xe)'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
        section: 'trail-detail',
        observed_value: 'Độ cao đỉnh: Không (Độ cao tích lũy 314m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-2.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 706,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/bus-trail-cat-tien/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_1_price: 759000'
      }
    ],
    issues: [
      {
        field: 'trip.peak_height_m',
        reason: 'Nguồn ghi Độ cao đỉnh là "Không" do là cung rừng mưa trũng thấp nhiệt đới, không có đỉnh núi cao; để null theo staging contract'
      },
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-2.svg, không có nhãn text tường minh trên giao diện'
      }
    ],
    review_status: 'needs_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2025/03/14.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-2.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/9-e1742365472324.jpg', alt: 'Cây Tung đại thụ hàng trăm năm tuổi tại Cát Tiên' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/13-e1742365554443.jpg', alt: 'Đạp xe trên đường mòn xuyên rừng Cát Tiên' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/03/10-1-e1742365611465.jpg', alt: 'Ghềnh đá Bến Cự dòng sông Đồng Nai' }
    ]
  },
  {
    slug: 'lao-than',
    source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
    source_title: 'Trail Bus - Lảo Thẩn - Go Trail',
    trip: {
      name: 'Trekking Săn Mây Núi Lảo Thẩn',
      city: 'Lào Cai',
      district: 'Bát Xát',
      location_name: 'Núi Lảo Thẩn (Y Tý)',
      difficulty_level: null,
      length_km: '14.0',
      peak_height_m: 2860,
      base_price: '1479000',
      description: 'Chinh phục "nóc nhà Y Tý" cao 2.860m tại huyện Bát Xát, Lào Cai. Cung trekking săn mây kinh điển của miền Bắc với những triền đồi cỏ cháy lộng gió, biển mây bồng bềnh và mỏm đá sống ảo vươn ra đại ngàn Tây Bắc.',
      schedule_content: 'Đêm 22:00 xuất phát từ Bến xe Mỹ Đình / Sân bay Nội Bài bằng xe giường nằm đến Lào Cai → Sáng xe trung chuyển đón lên Y Tý, ăn sáng tại nhà anh Hờ → Bắt đầu trekking xuyên đồi cỏ và rừng thưa → Ăn trưa dọc đường → Chiều chạm đỉnh chóp 2.860m săn mây → Xuống núi về Lào Cai lên xe giường nằm về lại Hà Nội.'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '1590000',
      displayed_price_vnd: '1479000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Bến Xe Mỹ Đình',
        address: '20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
        time_local: '22:00',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm hẹn Nhập Hội TP. Lào Cai',
        address: 'Bến xe trung tâm TP. Lào Cai, Tỉnh Lào Cai',
        time_local: '04:30',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
        section: 'trail-detail',
        observed_value: '~14km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
        section: 'trail-detail',
        observed_value: '2860m (độ cao tích lũy ~1080m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-3.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 1,479,000 VND'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-lao-than/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_0_price: 1590000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-3.svg, không có nhãn text tường minh trên giao diện'
      },
      {
        field: 'assets',
        reason: 'Banner carousel của trang Lảo Thẩn chứa ảnh hyundai-universe.jpg có alt ghi nhầm là Bus Trail - Cát Tiên'
      },
      {
        field: 'trip.schedule_content',
        reason: 'Hành trình di chuyển qua đêm (2 ngày 1 đêm hoặc xe đêm từ Hà Nội); khác với mô hình bus đi về trong ngày ở miền Nam'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2025/09/30-1024x1024.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-3.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2025/09/7.jpg', alt: 'Chóp đỉnh Lảo Thẩn 2860m ngập trong mây' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/09/6.jpg', alt: 'Đồi cỏ cháy và lối mòn trekking Y Tý' },
      { url: 'https://gotrail.vn/wp-content/uploads/2025/09/4.jpg', alt: 'Biển mây bồng bềnh lúc bình minh Lảo Thẩn' }
    ]
  },
  {
    slug: 'lang-biang',
    source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
    source_title: 'Trail Bus - Lang Biang - Go Trail',
    trip: {
      name: 'Trekking Đỉnh Lang Biang',
      city: 'Lâm Đồng',
      district: 'Lạc Dương',
      location_name: 'Núi Lang Biang',
      difficulty_level: null,
      length_km: '10.0',
      peak_height_m: 2167,
      base_price: '1386000',
      description: 'Chinh phục "nóc nhà Đà Lạt" cao 2.167m tại cao nguyên Lâm Viên. Tuyến trekking xuyên qua những cánh rừng thông reo ngút ngàn và rừng rêu nguyên sinh ẩm ướt, mở ra góc nhìn toàn cảnh thành phố sương mù và dòng suối Vàng uốn lượn dưới chân núi.',
      schedule_content: '23:00 Xe khởi hành từ Phan Chu Trinh (TP.HCM) đi Đà Lạt xuyên đêm → 06:00 Ăn sáng tại Đà Lạt → 07:45 Trekking xuyên rừng thông chinh phục đỉnh Lang Biang (2.167m) → 10:45 Ăn trưa dã ngoại giữa rừng → 15:00 Xuống núi, ăn tối đặc sản địa phương → 18:00 Dạo chợ đêm Đà Lạt → 21:45 Tập trung quảng trường Lâm Viên lên xe về TP.HCM (dự kiến đến 05:00 sáng hôm sau).'
    },
    ticket: {
      label: 'VÉ “KHÁM PHÁ”',
      includes_bus: true,
      includes_leader: true,
      regular_price_vnd: '1490000',
      displayed_price_vnd: '1386000',
      candidate_price_kind: 'displayed'
    },
    pickup_points: [
      {
        name: 'Điểm khởi hành Phan Chu Trinh',
        address: '177 Phan Chu Trinh, P.Bình Lợi Trung (Bãi xe 327 Nơ Trang Long, Bình Thạnh)',
        time_local: '23:00',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      {
        name: 'Điểm đón Sala Thủ Đức',
        address: '74 Nguyễn Cơ Thạch, An Lợi Đông, TP. Thủ Đức, TP.HCM',
        time_local: '23:30',
        timezone: 'Asia/Ho_Chi_Minh'
      }
    ],
    evidence: [
      {
        field: 'trip.length_km',
        source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
        section: 'trail-detail',
        observed_value: '~10km'
      },
      {
        field: 'trip.peak_height_m',
        source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
        section: 'trail-detail',
        observed_value: '~2167m (độ cao tích lũy ~682m)'
      },
      {
        field: 'trip.difficulty_level',
        source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
        section: 'trail-detail',
        observed_value: 'Icon i-do-kho-3.svg (không có text label)'
      },
      {
        field: 'ticket.displayed_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
        section: 'cost_structure',
        observed_value: 'VÉ “KHÁM PHÁ” - Vé xe + Trong ngày - 1,386,000 VND (ACF ghi 1385999)'
      },
      {
        field: 'ticket.regular_price_vnd',
        source_url: 'https://gotrail.vn/bus/trail-bus-lang-biang/',
        section: 'experience_ticket ACF meta',
        observed_value: 'experience_ticket_0_price: 1490000'
      }
    ],
    issues: [
      {
        field: 'trip.difficulty_level',
        reason: 'Nguồn dùng icon i-do-kho-3.svg, không có nhãn text tường minh trên giao diện'
      },
      {
        field: 'ticket.displayed_price_vnd',
        reason: 'Giá trong ACF meta là 1385999 trong khi Cấu trúc chi phí hiển thị làm tròn 1,386,000 VND'
      },
      {
        field: 'trip.schedule_content',
        reason: 'Tuyến đi đêm (xuất phát 23:00 từ TP.HCM, về 05:00 sáng hôm sau)'
      }
    ],
    review_status: 'ready_for_review',
    cover_image: 'https://gotrail.vn/wp-content/uploads/2026/02/z7472622327870_d41e5d011eccbfd0303690c94cc53c05-768x1024.jpg',
    difficulty_icon: 'https://gotrail.vn/wp-content/themes/inspiretrails/assets-v2/images/icons/bus/i-do-kho-3.svg',
    gallery_images: [
      { url: 'https://gotrail.vn/wp-content/uploads/2026/02/z7521946514760_bde7f5440d16849da736d0bf18acd020.jpg', alt: 'Rừng thông cao nguyên Lang Biang' },
      { url: 'https://gotrail.vn/wp-content/uploads/2026/02/z7521946330888_061a0284e8500303219c1af379167707.jpg', alt: 'Đoàn trekking giữa rừng rêu Lang Biang' },
      { url: 'https://gotrail.vn/wp-content/uploads/2026/02/z7472621243458_abdf3506726120a791a3140b39d9158c.jpg', alt: 'Tầm nhìn từ sườn núi Lang Biang xuống thung lũng' }
    ]
  }
];

function main() {
  const targetDir = 'data/reference/gotrail';
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Build catalog.json
  const catalogItems = routes.map(r => ({
    source_url: r.source_url,
    fetched_at: FETCHED_AT,
    source_title: r.source_title,
    trip: r.trip,
    ticket: r.ticket,
    pickup_points: r.pickup_points,
    evidence: r.evidence,
    issues: r.issues,
    review_status: r.review_status
  }));

  const catalog = {
    schema_version: 1,
    items: catalogItems
  };

  const catalogPath = path.join(targetDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Saved catalog.json with ${catalogItems.length} items to ${catalogPath}`);

  // 2. Build assets.json
  const assetItems = [];
  for (const r of routes) {
    // Cover
    if (r.cover_image) {
      assetItems.push({
        source_url: r.source_url,
        image_url: r.cover_image,
        role: 'cover',
        alt: `${r.trip.name} - Ảnh đại diện bìa`,
        fetched_at: FETCHED_AT
      });
    }

    // Difficulty icon
    if (r.difficulty_icon) {
      assetItems.push({
        source_url: r.source_url,
        image_url: r.difficulty_icon,
        role: 'difficulty',
        alt: `Icon cấp độ khó ${r.trip.name}`,
        fetched_at: FETCHED_AT
      });
    }

    // Gallery
    for (const g of r.gallery_images) {
      assetItems.push({
        source_url: r.source_url,
        image_url: g.url,
        role: 'gallery',
        alt: g.alt,
        fetched_at: FETCHED_AT
      });
    }
  }

  const assets = {
    schema_version: 1,
    items: assetItems
  };

  const assetsPath = path.join(targetDir, 'assets.json');
  fs.writeFileSync(assetsPath, JSON.stringify(assets, null, 2), 'utf8');
  console.log(`Saved assets.json with ${assetItems.length} items to ${assetsPath}`);
}

main();
