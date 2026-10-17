; 64K CoCo 1/2 profile. Run from low RAM while copying ROM under itself.
; BASIC's KEYIN/cassette entry points remain at their real target addresses.
; Extended BASIC's RAM copy is subsequently reused for the language arena.
; No JavaScript memory service is required on real hardware.
t_large_init
        pshs cc,d,x
        orcc #$50
        ldx #$8000
t_large_copy
        lda ,x
        sta $ffdf
        sta ,x
        sta $ffde
        leax 1,x
        cmpx #$c000
        blo t_large_copy
        ldx #$fff0
t_large_vectors
        lda ,x
        sta $ffdf
        sta ,x
        sta $ffde
        leax 1,x
        bne t_large_vectors
        sta $ffdf
        puls cc,d,x,pc
