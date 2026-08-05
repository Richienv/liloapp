import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();

    // Public marketplace inventory. Brands ship physical product to whoever
    // they book, so only accounts an admin has verified — and that are still
    // active — may appear here.
    const { data: streamers, error: streamersError } = await supabase
      .from('streamers')
      .select('*')
      .eq('is_active', true)
      .eq('verification_status', 'approved');

    if (streamersError) {
      console.error('Error fetching streamers:', streamersError);
      return NextResponse.json({ error: 'Failed to fetch streamers' }, { status: 500 });
    }

    // Then get current discounts with specific conditions
    const { data: discounts, error: discountsError } = await supabase
      .from('streamer_current_discounts')
      .select('*')
      .not('previous_price', 'is', null)
      .not('discount_percentage', 'is', null)
      .gt('discount_percentage', 0); // Only get real discounts

    if (discountsError) {
      console.error('Error fetching discounts:', discountsError);
      return NextResponse.json({ error: 'Failed to fetch discounts' }, { status: 500 });
    }

    // Create a map of discounts by streamer_id for easier lookup
    const discountMap = new Map(
      discounts?.map(discount => [discount.streamer_id, discount]) || []
    );

    // Combine the data
    const processedStreamers = streamers.map(streamer => {
      const discountInfo = discountMap.get(streamer.id);

      console.log('Processing streamer with discount:', {
        streamerId: streamer.id,
        hasDiscount: !!discountInfo,
        currentPrice: discountInfo?.current_price || streamer.price,
        previousPrice: discountInfo?.previous_price,
        discountPercentage: discountInfo?.discount_percentage
      });

      return {
        ...streamer,
        price: discountInfo?.current_price || streamer.price,
        previous_price: discountInfo?.previous_price || null,
        discount_percentage: discountInfo?.discount_percentage || null
      };
    });

    return NextResponse.json({ streamers: processedStreamers });

  } catch (error) {
    console.error('Error in streamers route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}