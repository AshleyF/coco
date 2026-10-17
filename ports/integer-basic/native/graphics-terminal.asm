; Native 40x24 terminal, RG6/PMODE4. No browser or host rendering service.
; 6x8 cells, 240x192 pixels, 8-pixel horizontal margins. White on black.
gt_col equ $53a0
gt_row equ $53a1
gt_visible equ $53a2
gt_clock equ $53a3
gt_shift equ $53a5
gt_clear_mask equ $53a6
gt_glyph equ $53a8
gt_count equ $53aa

gt_init
        pshs cc,d,x,y,u,dp
        jsr gt_clear
        clr gt_clock
        clr gt_clock+1
        ; PIA1 B: preserve cassette/sound bits, set graphics pins as outputs.
        lda $ff23
        anda #$fb
        sta $ff23
        lda $ff22
        ora #$f8
        sta $ff22
        lda $ff23
        ora #4
        sta $ff23
        lda $ff22
        ora #$f8
        sta $ff22
        ; SAM RG6 mode=110; video base $0800 (F2 only).
        sta $ffc0
        sta $ffc3
        sta $ffc5
        sta $ffc6
        sta $ffc8
        sta $ffcb
        sta $ffcc
        sta $ffce
        sta $ffd0
        sta $ffd2
        jsr gt_show
        puls cc,d,x,y,u,dp,pc

gt_clear
        ldx #$0800
        clra
        clrb
gt_clear_loop
        std ,x++
        cmpx #$2000
        blo gt_clear_loop
        clr gt_col
        clr gt_row
        clr gt_visible
        rts

gt_write
        pshs cc,d,x,y,u,dp
        jsr gt_hide
        lda 1,s
        anda #$7f
        cmpa #13
        beq gt_cr
        cmpa #12
        beq gt_formfeed
        cmpa #8
        beq gt_backspace
        cmpa #32
        lblo gt_done
        cmpa #96
        blo gt_print
        suba #32
gt_print
        pshs a
        jsr gt_position
        puls a
        anda #$3f
        ldb #8
        mul
        ldu #gt_font
        leay d,u
        ldu #8
gt_draw_row
        lda ,y+
        clrb
        jsr gt_shift_bits
        std gt_glyph
        lda ,x
        anda gt_clear_mask
        ora gt_glyph
        sta ,x
        lda 1,x
        anda gt_clear_mask+1
        ora gt_glyph+1
        sta 1,x
        leax 32,x
        leau -1,u
        cmpu #0
        bne gt_draw_row
        inc gt_col
        lda gt_col
        cmpa #40
        lblo gt_done
gt_cr
        clr gt_col
        inc gt_row
        lda gt_row
        cmpa #24
        lblo gt_done
        jsr gt_scroll
        bra gt_done
gt_formfeed
        jsr gt_clear
        bra gt_done
gt_backspace
        tst gt_col
        bne gt_back_one
        tst gt_row
        beq gt_done
        dec gt_row
        lda #40
        sta gt_col
gt_back_one
        dec gt_col
        ; Erase the cell without advancing the cursor.
        jsr gt_position
        ldu #8
gt_erase_row
        lda ,x
        anda gt_clear_mask
        sta ,x
        lda 1,x
        anda gt_clear_mask+1
        sta 1,x
        leax 32,x
        leau -1,u
        cmpu #0
        bne gt_erase_row
gt_done
        jsr gt_show
        puls cc,d,x,y,u,dp,pc

; X=cell's first raster byte, gt_shift=bit offset, clear_mask preserves neighbors.
gt_position
        lda gt_row
        clrb
        ldy #$0800
        leax d,y
        lda gt_col
        ldb #6
        mul
        addd #8
        tfr b,a
        anda #7
        sta gt_shift
        lsrb
        lsrb
        lsrb
        abx
        ldd #$fc00
        jsr gt_shift_bits
        coma
        comb
        std gt_clear_mask
        rts

gt_shift_bits
        pshs a
        lda gt_shift
        sta gt_count
        puls a
        tst gt_count
        beq gt_shift_done
gt_shift_loop
        lsra
        rorb
        dec gt_count
        bne gt_shift_loop
gt_shift_done
        rts

gt_scroll
        ldx #$0900
        ldy #$0800
        ldu #$1700
gt_scroll_copy
        ldd ,x++
        std ,y++
        leau -2,u
        cmpu #0
        bne gt_scroll_copy
        clra
        clrb
gt_scroll_clear
        std ,y++
        cmpy #$2000
        blo gt_scroll_clear
        lda #23
        sta gt_row
        rts

gt_hide
        tst gt_visible
        beq gt_cursor_return
        clr gt_visible
        bra gt_xor_cursor
gt_show
        tst gt_visible
        bne gt_cursor_return
        inc gt_visible
gt_xor_cursor
        jsr gt_position
        ldu #8
gt_cursor_row
        lda gt_clear_mask
        coma
        eora ,x
        sta ,x
        lda gt_clear_mask+1
        coma
        eora 1,x
        sta 1,x
        leax 32,x
        leau -1,u
        cmpu #0
        bne gt_cursor_row
gt_cursor_return
        rts

; Blink only in the blocking keyboard wait. Preserve the input ABI registers.
gt_tick
        pshs cc,d,x,y,u,dp
        ldd gt_clock
        addd #1
        std gt_clock
        cmpd #256
        bne gt_tick_done
        clr gt_clock
        clr gt_clock+1
        lda gt_visible
        eora #1
        sta gt_visible
        jsr gt_xor_cursor
gt_tick_done
        puls cc,d,x,y,u,dp,pc
        include "../build/graphics-font.inc"
gt_code_end
        ifgt gt_code_end-$5000
        error "Graphics interpreter overlaps private workspace"
        endc
